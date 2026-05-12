package com.agratec.fieldapp.sync

import android.content.Context
import android.util.Log
import androidx.work.*
import com.agratec.fieldapp.data.local.AppDatabase
import com.agratec.fieldapp.data.remote.RetrofitClient
import com.agratec.fieldapp.data.remote.dto.SyncNoteItem
import com.agratec.fieldapp.data.remote.dto.SyncNotesRequest
import com.agratec.fieldapp.data.remote.dto.TrpcMutationRequest
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Worker de sincronización que se ejecuta en background.
 * Implementa CoroutineWorker para soporte de coroutines.
 *
 * Flujo:
 * 1. Lee notas locales NO sincronizadas (batch de 10)
 * 2. Las envía al servidor via tRPC offlineSync.syncFieldNotes
 * 3. Si el servidor responde 200 OK, marca isSynced = true en Room
 * 4. Luego repite el proceso para fotos (una por una, multipart)
 * 5. Si falla por red, retorna Result.retry() (WorkManager reintentará con backoff)
 *
 * Se ejecuta bajo constraints de red: solo cuando hay conexión disponible.
 */
class SyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    companion object {
        const val TAG = "SyncWorker"
        const val UNIQUE_WORK_NAME = "agra_field_sync"

        /**
         * Programar sincronización periódica.
         * Se ejecuta cada 15 minutos cuando hay conexión a internet.
         * Si no hay red, WorkManager espera automáticamente.
         */
        fun enqueuePeriodicSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(
                repeatInterval = 15,
                repeatIntervalTimeUnit = TimeUnit.MINUTES,
            )
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS,
                )
                .addTag(TAG)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                syncRequest,
            )
            Log.i(TAG, "Sincronización periódica programada (cada 15 min)")
        }

        /**
         * Ejecutar sincronización inmediata (one-shot).
         * Útil cuando el usuario acaba de crear una nota y quiere forzar sync.
         */
        fun enqueueImmediateSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .addTag("${TAG}_immediate")
                .build()

            WorkManager.getInstance(context).enqueue(syncRequest)
            Log.i(TAG, "Sincronización inmediata programada")
        }
    }

    override suspend fun doWork(): Result {
        Log.i(TAG, "=== Iniciando sincronización ===")

        // Verificar que hay token de sesión
        if (!RetrofitClient.isLoggedIn(applicationContext)) {
            Log.w(TAG, "No hay sesión activa, omitiendo sync")
            return Result.success()
        }

        val db = AppDatabase.getInstance(applicationContext)
        val apiService = RetrofitClient.getApiService(applicationContext)

        var notesSynced = 0
        var photosSynced = 0
        var errors = 0

        // ===== PASO 1: Sincronizar notas de campo =====
        try {
            val unsyncedNotes = db.fieldNoteDao().getUnsyncedNotes(limit = 10)

            if (unsyncedNotes.isNotEmpty()) {
                Log.i(TAG, "Sincronizando ${unsyncedNotes.size} notas...")

                val syncItems = unsyncedNotes.map { note ->
                    SyncNoteItem(
                        folio = note.folio,
                        description = note.description,
                        category = note.category,
                        severity = note.severity,
                        parcelId = note.parcelId,
                        latitude = note.latitude,
                        longitude = note.longitude,
                        createdAtLocal = note.createdAtLocal,
                    )
                }

                val response = apiService.syncFieldNotes(
                    TrpcMutationRequest(SyncNotesRequest(notes = syncItems))
                )

                if (response.isSuccessful) {
                    val data = response.body()?.result?.data?.json
                    if (data?.success == true) {
                        // Marcar cada nota como sincronizada
                        data.results?.forEach { result ->
                            if (result.status != "error") {
                                db.fieldNoteDao().markAsSynced(result.folio)
                                notesSynced++
                                Log.d(TAG, "Nota ${result.folio} -> ${result.status}")
                            } else {
                                db.fieldNoteDao().markSyncFailed(
                                    result.folio,
                                    result.error ?: "Error desconocido"
                                )
                                errors++
                                Log.w(TAG, "Error en nota ${result.folio}: ${result.error}")
                            }
                        }
                    }
                } else {
                    Log.e(TAG, "Error HTTP al sincronizar notas: ${response.code()}")
                    // Si es error de auth, no reintentar
                    if (response.code() == 401) {
                        Log.e(TAG, "Token expirado, se requiere re-login")
                        return Result.failure()
                    }
                    return Result.retry()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Excepción al sincronizar notas", e)
            return Result.retry()
        }

        // ===== PASO 2: Sincronizar fotos (una por una) =====
        try {
            val unsyncedPhotos = db.photoDao().getUnsyncedPhotos(limit = 5)

            if (unsyncedPhotos.isNotEmpty()) {
                Log.i(TAG, "Sincronizando ${unsyncedPhotos.size} fotos...")

                for (photo in unsyncedPhotos) {
                    try {
                        val file = File(photo.localFilePath)
                        if (!file.exists()) {
                            Log.w(TAG, "Archivo no encontrado: ${photo.localFilePath}")
                            db.photoDao().markSyncFailed(
                                photo.localPhotoId,
                                "Archivo local no encontrado"
                            )
                            errors++
                            continue
                        }

                        // Construir request multipart
                        val requestFile = file.asRequestBody("image/jpeg".toMediaTypeOrNull())
                        val photoPart = MultipartBody.Part.createFormData(
                            "photo", file.name, requestFile
                        )
                        val folioPart = photo.fieldNoteFolio
                            .toRequestBody("text/plain".toMediaTypeOrNull())
                        val photoIdPart = photo.localPhotoId
                            .toRequestBody("text/plain".toMediaTypeOrNull())

                        val response = apiService.uploadPhoto(
                            photo = photoPart,
                            fieldNoteFolio = folioPart,
                            localPhotoId = photoIdPart,
                        )

                        if (response.isSuccessful && response.body()?.success == true) {
                            db.photoDao().markAsSynced(photo.localPhotoId)
                            photosSynced++
                            Log.d(TAG, "Foto ${photo.localPhotoId} sincronizada OK")
                        } else {
                            val errorMsg = response.body()?.error
                                ?: "HTTP ${response.code()}"
                            db.photoDao().markSyncFailed(photo.localPhotoId, errorMsg)
                            errors++
                            Log.w(TAG, "Error al subir foto ${photo.localPhotoId}: $errorMsg")
                        }
                    } catch (e: Exception) {
                        db.photoDao().markSyncFailed(
                            photo.localPhotoId,
                            e.message ?: "Error desconocido"
                        )
                        errors++
                        Log.e(TAG, "Excepción al subir foto ${photo.localPhotoId}", e)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Excepción al sincronizar fotos", e)
            return Result.retry()
        }

        Log.i(TAG, "=== Sincronización completada: $notesSynced notas, $photosSynced fotos, $errors errores ===")

        // Si quedan más items pendientes, programar otro run
        val remainingNotes = db.fieldNoteDao().getUnsyncedCount()
        val remainingPhotos = db.photoDao().getUnsyncedCount()
        if (remainingNotes > 0 || remainingPhotos > 0) {
            Log.i(TAG, "Quedan $remainingNotes notas y $remainingPhotos fotos pendientes")
        }

        return Result.success()
    }
}
