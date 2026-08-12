package com.agratec.fieldapp.sync

import android.content.Context
import android.util.Log
import androidx.work.*
import com.agratec.fieldapp.data.local.AppDatabase
import com.agratec.fieldapp.data.prefs.SyncPreferences
import com.agratec.fieldapp.data.remote.RetrofitClient
import com.agratec.fieldapp.data.remote.dto.ActivityProductDto
import com.agratec.fieldapp.data.remote.dto.SyncActivitiesRequest
import com.agratec.fieldapp.data.remote.dto.SyncActivityItem
import com.agratec.fieldapp.data.remote.dto.SyncNoteItem
import com.agratec.fieldapp.data.remote.dto.SyncNotesRequest
import com.agratec.fieldapp.data.remote.dto.TrpcMutationRequest
import com.agratec.fieldapp.data.remote.dto.WorkSessionDto
import com.agratec.fieldapp.util.AppLogger
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Worker de sincronización en segundo plano.
 *
 * REGLA PRINCIPAL: cada paso es INDEPENDIENTE. Si las notas fallan, las
 * actividades igual se sincronizan (antes un error en el primer paso abortaba
 * todo y las actividades nunca subían).
 *
 * Orden:
 *  1. Datos que pesan poco — SIEMPRE, con datos móviles o WiFi:
 *     parcelas, colaboradores, notas, actividades (subida y bajada)
 *  2. Fotos — solo con WiFi, o con datos móviles si el usuario lo autorizó
 *
 * El resultado queda en [SyncStatus] para mostrárselo al usuario.
 *
 * SEGUNDO PLANO: mientras haya algo pendiente, el trabajo corre en primer plano
 * con una notificación de progreso. Así el usuario puede salir de la app (o
 * apagar la pantalla) sin que el sistema mate la subida a medio camino, y ve
 * cuánto falta. Al terminar queda un aviso con el resultado.
 */
class SyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    companion object {
        const val TAG = "SyncWorker"
        const val UNIQUE_WORK_NAME = "agra_field_sync"

        /**
         * Arriba de esto la foto se vuelve a comprimir antes de subir.
         * Está por encima del tamaño normal de una foto ya procesada (~450 KB)
         * para no reprocesar de balde, pero muy por debajo de lo que pesaban
         * las fotos tomadas con las versiones anteriores de la app.
         */
        private const val MAX_UPLOAD_BYTES = 900_000L

        /** Sincronización periódica cada 15 minutos cuando hay conexión */
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

        /** Sincronización inmediata (one-shot) */
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

    /** Errores acumulados con mensaje legible para el usuario */
    private val problems = mutableListOf<String>()

    private fun httpProblem(what: String, code: Int): String = when (code) {
        401 -> "Tu sesión expiró: vuelve a iniciar sesión"
        403 -> "Tu usuario no tiene permiso para $what"
        404 -> "El servidor no tiene soporte para $what (falta actualizar el servidor)"
        in 500..599 -> "El servidor tuvo un error al $what (código $code)"
        else -> "No se pudo $what (código $code)"
    }

    /** Total de elementos por subir en esta corrida (para la barra de progreso) */
    private var totalPendiente = 0
    private var hechos = 0
    private var enPrimerPlano = false

    /**
     * Actualiza la notificación de progreso.
     * Si el sistema no deja correr en primer plano (permiso revocado, versiones
     * viejas, restricciones del fabricante), la sincronización sigue igual: solo
     * se queda sin notificación.
     */
    private suspend fun avance(texto: String) {
        if (totalPendiente <= 0) return
        try {
            setForeground(SyncNotifier.foregroundInfo(applicationContext, texto, hechos, totalPendiente))
            enPrimerPlano = true
        } catch (e: Exception) {
            if (enPrimerPlano) Log.w(TAG, "No se pudo actualizar el progreso", e)
        }
    }

    override suspend fun doWork(): Result {
        Log.i(TAG, "=== Iniciando sincronización ===")

        if (!RetrofitClient.isLoggedIn(applicationContext)) {
            Log.w(TAG, "No hay sesión activa, omitiendo sync")
            SyncStatus.record(applicationContext, "Inicia sesión para sincronizar", ok = false)
            return Result.success()
        }

        val db = AppDatabase.getInstance(applicationContext)
        val apiService = RetrofitClient.getApiService(applicationContext)

        val networkType = NetworkUtils.currentType(applicationContext)
        val photosAllowed = SyncPreferences.canUploadPhotosNow(applicationContext)
        Log.i(TAG, "Red: $networkType · fotos permitidas: $photosAllowed")

        var notesSynced = 0
        var photosSynced = 0
        var activitiesSynced = 0
        var activityPhotosSynced = 0
        var productPhotosSynced = 0
        var authFailed = false
        var networkFailed = false
        val inicio = System.currentTimeMillis()

        // Cuánto hay por subir: es lo que se le muestra al usuario en la barra
        totalPendiente = db.fieldNoteDao().getUnsyncedNotes(limit = 999).size +
            db.fieldActivityDao().getUnsynced(limit = 999).size +
            db.productDao().getUnsyncedCount() +
            db.productDao().getPendingPhotoCount() +
            (if (photosAllowed) db.photoDao().getUnsyncedCount() + db.activityPhotoDao().getUnsyncedCount() else 0)
        if (totalPendiente > 0) avance("Preparando $totalPendiente elemento${if (totalPendiente == 1) "" else "s"}")

        // ============================================================
        // DATOS (siempre, pesan poco)
        // ============================================================

        // ── Parcelas ──
        try {
            val parcelRepo = com.agratec.fieldapp.data.repository.ParcelRepository(applicationContext)
            if (parcelRepo.syncFromServer()) Log.i(TAG, "Parcelas actualizadas desde servidor")
        } catch (e: Exception) {
            Log.w(TAG, "Error sincronizando parcelas", e)
            problems.add("No se pudieron actualizar las parcelas")
        }

        // ── Personal de campo (antes de actividades: resuelven las asignaciones) ──
        try {
            val collabRepo = com.agratec.fieldapp.data.repository.CollaboratorRepository(applicationContext)
            val pushResult = collabRepo.pushUnsynced()
            if (pushResult.httpCode == 401) authFailed = true
            if (pushResult.problem != null) problems.add(pushResult.problem)
            // Primero se sube lo local y después se baja: así el personal dado
            // de alta en otro dispositivo aparece también en este
            collabRepo.pullFromServer()
            collabRepo.pullRoles()
        } catch (e: Exception) {
            Log.w(TAG, "Error sincronizando el personal", e)
            problems.add("No se pudo sincronizar el personal")
        }

        // ── Almacén de productos (antes de actividades: resuelven el consumo) ──
        try {
            val productRepo = com.agratec.fieldapp.data.repository.ProductRepository(applicationContext)
            val pushResult = productRepo.pushUnsynced()
            if (pushResult.httpCode == 401) authFailed = true
            if (pushResult.problem != null) problems.add(pushResult.problem)
            productRepo.pullFromServer()
        } catch (e: Exception) {
            Log.w(TAG, "Error sincronizando el almacén", e)
            problems.add("No se pudo sincronizar el almacén")
        }

        // ── Notas de campo (no bloquea a las actividades si falla) ──
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
                        // Una nota puede nacer ya cerrada desde el campo
                        status = note.status,
                        resolutionNotes = note.resolutionNotes,
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
                    response.body()?.result?.data?.json?.results?.forEach { result ->
                        if (result.status != "error") {
                            db.fieldNoteDao().markAsSynced(result.folio)
                            notesSynced++
                        } else {
                            db.fieldNoteDao().markSyncFailed(result.folio, result.error ?: "Error desconocido")
                            problems.add("Nota rechazada: ${result.error ?: "error desconocido"}")
                        }
                    }
                } else {
                    if (response.code() == 401) authFailed = true
                    problems.add(httpProblem("subir las notas", response.code()))
                    Log.e(TAG, "Error HTTP notas: ${response.code()}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Excepción notas", e)
            networkFailed = true
            problems.add("Sin conexión al subir notas")
        }

        // ── Seguimiento de notas: subir los cierres hechos en el campo y
        //    bajar las notas del servidor (nuevas, cambios y borrados) ──
        try {
            val noteRepo = com.agratec.fieldapp.data.repository.FieldNoteRepository(applicationContext)
            // Primero se sube: si no, el pull traería el estado viejo del servidor
            notesSynced += noteRepo.pushStatusChanges()
            noteRepo.pullFromServer()
        } catch (e: Exception) {
            Log.w(TAG, "Error sincronizando el seguimiento de notas", e)
        }

        hechos += notesSynced
        avance("Notas y catálogos listos")

        // ── Actividades de la libreta ──
        try {
            val allUnsynced = db.fieldActivityDao().getUnsynced(limit = 10)
            val collabDao = db.collaboratorDao()
            val unsyncedActivities = mutableListOf<com.agratec.fieldapp.data.local.entity.FieldActivityEntity>()
            val collabIdsByActivity = mutableMapOf<String, List<Int>>()

            for (act in allUnsynced) {
                val serverIds = mutableListOf<Int>()
                var waitForCollaborator = false
                for (uuid in act.collaboratorUuids()) {
                    val collab = collabDao.getByUuid(uuid)
                    when {
                        collab?.serverId != null -> serverIds.add(collab.serverId)
                        // Solo esperamos si el colaborador tiene reintentos vivos Y
                        // la actividad no lleva demasiado tiempo atorada por su culpa
                        collab != null && collab.syncAttempts < 3 && act.syncAttempts < 3 -> waitForCollaborator = true
                        else -> Log.w(TAG, "Colaborador $uuid omitido en ${act.clientUuid}")
                    }
                }
                if (waitForCollaborator) {
                    // Contabilizar el intento: así la actividad nunca se atora para siempre
                    db.fieldActivityDao().markSyncFailed(act.clientUuid, "Esperando que suba el colaborador")
                    Log.i(TAG, "Actividad ${act.clientUuid} pospuesta (colaborador pendiente)")
                    continue
                }
                unsyncedActivities.add(act)
                collabIdsByActivity[act.clientUuid] = serverIds
            }

            if (unsyncedActivities.isNotEmpty()) {
                Log.i(TAG, "Sincronizando ${unsyncedActivities.size} actividades...")
                val productDao = db.productDao()
                val items = unsyncedActivities.map { act ->
                    // Horas y jornadas SOLO en la primera subida: en updates el
                    // teléfono solo cambia el estado (la web manda en el resto)
                    val isFirstUpload = act.serverId == null

                    // Consumo de productos: el almacén ya se subió unos pasos
                    // antes, así que normalmente el serverId ya está resuelto.
                    // Si un producto sigue pendiente, la línea se manda igual
                    // con su nombre: el consumo no se pierde por esperar al
                    // catálogo (se vinculará al producto cuando se edite).
                    val productDtos = act.products().map { p ->
                        val serverId = p.serverId
                            ?: p.productUuid?.let { productDao.getByUuid(it)?.serverId }
                        ActivityProductDto(
                            productId = serverId,
                            productName = p.name.take(255),
                            unit = p.unit,
                            plannedQuantity = p.planned?.take(32),
                            usedQuantity = p.used?.take(32),
                        )
                    }

                    SyncActivityItem(
                        clientUuid = act.clientUuid,
                        serverId = act.serverId,
                        activityType = act.activityType,
                        activitySubtype = act.activitySubtype?.take(128),
                        description = act.description.ifBlank { act.activityType },
                        performedBy = act.performedBy.takeIf { it.isNotBlank() }?.take(255),
                        activityDate = act.activityDate,
                        startTime = if (isFirstUpload) act.startTime else null,
                        endTime = if (isFirstUpload) act.endTime else null,
                        status = act.status,
                        parcelIds = act.parcelIds().takeIf { it.isNotEmpty() },
                        collaboratorIds = collabIdsByActivity[act.clientUuid]?.takeIf { it.isNotEmpty() },
                        workSessions = if (isFirstUpload) act.workSessions().takeIf { it.isNotEmpty() }?.map {
                            WorkSessionDto(it.workDate, it.startTime, it.endTime)
                        } else null,
                        products = productDtos.takeIf { it.isNotEmpty() },
                    )
                }

                val response = apiService.syncFieldActivities(
                    TrpcMutationRequest(SyncActivitiesRequest(activities = items))
                )

                if (response.isSuccessful) {
                    val data = response.body()?.result?.data?.json
                    if (data?.success == true) {
                        data.results?.forEach { result ->
                            when {
                                result.status == "deleted" -> {
                                    db.activityPhotoDao().deleteForActivity(result.clientUuid)
                                    db.fieldActivityDao().deleteByUuid(result.clientUuid)
                                    Log.i(TAG, "Actividad ${result.clientUuid} eliminada en la web")
                                }
                                result.status != "error" -> {
                                    val uploaded = unsyncedActivities.find { it.clientUuid == result.clientUuid }
                                    db.fieldActivityDao().markAsSyncedIfStatus(
                                        result.clientUuid, result.serverId, uploaded?.status ?: "",
                                    )
                                    activitiesSynced++
                                }
                                else -> {
                                    db.fieldActivityDao().markSyncFailed(
                                        result.clientUuid, result.error ?: "Error desconocido",
                                    )
                                    problems.add("Actividad rechazada: ${result.error ?: "error desconocido"}")
                                }
                            }
                        }
                    } else {
                        problems.add("El servidor no aceptó las actividades")
                    }
                } else {
                    if (response.code() == 401) authFailed = true
                    problems.add(httpProblem("subir las actividades", response.code()))
                    Log.e(TAG, "Error HTTP actividades: ${response.code()}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Excepción actividades", e)
            networkFailed = true
            problems.add("Sin conexión al subir actividades")
        }

        // ── Bajar del servidor todo lo que cambió (para tener el teléfono al día) ──
        try {
            val activityRepo = com.agratec.fieldapp.data.repository.FieldActivityRepository(applicationContext)
            activityRepo.pullFromServer()
        } catch (e: Exception) {
            Log.w(TAG, "Error bajando actividades", e)
        }

        hechos += activitiesSynced
        avance("Actividades listas")

        // ── Fotos de los productos del almacén (pesan poco: van siempre) ──
        try {
            val productRepo = com.agratec.fieldapp.data.repository.ProductRepository(applicationContext)
            productPhotosSynced = productRepo.pushPhotos()
            if (productPhotosSynced > 0) {
                hechos += productPhotosSynced
                avance("Fotos de productos subidas")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error subiendo fotos de productos", e)
        }

        // ============================================================
        // FOTOS (solo WiFi, o datos móviles si el usuario lo autorizó)
        // ============================================================
        val notePhotosPending = db.photoDao().getUnsyncedCount()
        val activityPhotosPending = db.activityPhotoDao().getUnsyncedCount()
        val totalPhotosPending = notePhotosPending + activityPhotosPending

        if (!photosAllowed) {
            if (totalPhotosPending > 0) {
                Log.i(TAG, "$totalPhotosPending fotos esperan WiFi (red actual: $networkType)")
            }
        } else {
            // ── Fotos de notas ──
            try {
                val unsyncedPhotos = db.photoDao().getUnsyncedPhotos(limit = 20)
                for (photo in unsyncedPhotos) {
                    try {
                        val file = File(photo.localFilePath)
                        if (!file.exists()) {
                            db.photoDao().markSyncFailed(photo.localPhotoId, "Archivo local no encontrado")
                            continue
                        }
                        // Fotos viejas tomadas antes de la compresión: reducirlas ahora
                        // (una foto de 48MP tardaba tanto que tumbaba la sincronización)
                        if (file.length() > MAX_UPLOAD_BYTES) {
                            // Foto de una versión anterior de la app: se reduce ahora
                            com.agratec.fieldapp.util.ImageProcessor.compressInPlace(
                                photo.localFilePath,
                                dataSaver = SyncPreferences.dataSaver(applicationContext),
                            )
                        }
                        val requestFile = file.asRequestBody("image/jpeg".toMediaTypeOrNull())
                        val response = apiService.uploadPhoto(
                            photo = MultipartBody.Part.createFormData("photo", file.name, requestFile),
                            fieldNoteFolio = photo.fieldNoteFolio.toRequestBody("text/plain".toMediaTypeOrNull()),
                            localPhotoId = photo.localPhotoId.toRequestBody("text/plain".toMediaTypeOrNull()),
                        )
                        if (response.isSuccessful && response.body()?.success == true) {
                            db.photoDao().markAsSynced(photo.localPhotoId)
                            photosSynced++
                            hechos++
                            avance("Subiendo fotos ($hechos de $totalPendiente)")
                        } else {
                            if (response.code() == 401) authFailed = true
                            db.photoDao().markSyncFailed(
                                photo.localPhotoId,
                                response.body()?.error ?: "HTTP ${response.code()}",
                            )
                        }
                    } catch (e: Exception) {
                        db.photoDao().markSyncFailed(photo.localPhotoId, e.message ?: "Error desconocido")
                        networkFailed = true
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Excepción fotos de notas", e)
            }

            // ── Fotos de actividades ──
            try {
                val photos = db.activityPhotoDao().getUnsyncedUploadable(limit = 10)
                for (photo in photos) {
                    try {
                        val file = File(photo.localFilePath)
                        if (!file.exists()) {
                            db.activityPhotoDao().markSyncFailed(photo.localPhotoId, "Archivo local no encontrado")
                            continue
                        }
                        if (file.length() > MAX_UPLOAD_BYTES) {
                            // Foto de una versión anterior de la app: se reduce ahora
                            com.agratec.fieldapp.util.ImageProcessor.compressInPlace(
                                photo.localFilePath,
                                dataSaver = SyncPreferences.dataSaver(applicationContext),
                            )
                        }
                        val requestFile = file.asRequestBody("image/jpeg".toMediaTypeOrNull())
                        val response = apiService.uploadActivityPhoto(
                            photo = MultipartBody.Part.createFormData("photo", file.name, requestFile),
                            activityClientUuid = photo.activityClientUuid.toRequestBody("text/plain".toMediaTypeOrNull()),
                            localPhotoId = photo.localPhotoId.toRequestBody("text/plain".toMediaTypeOrNull()),
                            photoType = photo.photoType.toRequestBody("text/plain".toMediaTypeOrNull()),
                        )
                        if (response.isSuccessful && response.body()?.success == true) {
                            db.activityPhotoDao().markAsSynced(photo.localPhotoId)
                            activityPhotosSynced++
                            hechos++
                            avance("Subiendo fotos ($hechos de $totalPendiente)")
                        } else {
                            if (response.code() == 401) authFailed = true
                            db.activityPhotoDao().markSyncFailed(
                                photo.localPhotoId,
                                response.body()?.error ?: "HTTP ${response.code()}",
                            )
                        }
                    } catch (e: Exception) {
                        db.activityPhotoDao().markSyncFailed(photo.localPhotoId, e.message ?: "Error desconocido")
                        networkFailed = true
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Excepción fotos de actividades", e)
            }
        }

        // ============================================================
        // RESULTADO PARA EL USUARIO
        // ============================================================
        val stillPendingPhotos = db.photoDao().getUnsyncedCount() + db.activityPhotoDao().getUnsyncedCount()
        val subidos = notesSynced + activitiesSynced
        val fotos = photosSynced + activityPhotosSynced + productPhotosSynced

        // Si el 401 persistió es que ni la renovación automática funcionó
        val sessionReallyExpired = authFailed && RetrofitClient.isSessionExpired(applicationContext)

        val message = when {
            sessionReallyExpired -> "Tu sesión terminó: vuelve a iniciar sesión"
            authFailed -> "Reintentando con sesión renovada..."
            problems.isNotEmpty() -> problems.first()
            subidos == 0 && fotos == 0 && stillPendingPhotos == 0 -> "Todo está sincronizado"
            else -> buildString {
                if (subidos > 0) append("$subidos registro${if (subidos == 1) "" else "s"} sincronizado${if (subidos == 1) "" else "s"}")
                if (fotos > 0) {
                    if (isNotEmpty()) append(" · ")
                    append("$fotos foto${if (fotos == 1) "" else "s"} subida${if (fotos == 1) "" else "s"}")
                }
                if (isEmpty()) append("Datos actualizados")
            }
        }
        val photosWaiting = if (!photosAllowed) stillPendingPhotos else 0
        SyncStatus.record(applicationContext, message, ok = !authFailed && problems.isEmpty(), photosWaitingForWifi = photosWaiting)

        Log.i(TAG, "=== Sync: $notesSynced notas, $activitiesSynced actividades, $fotos fotos, ${problems.size} problemas ===")

        // ── Aviso al usuario ──
        // Solo cuando hubo algo real que subir: una notificación por cada
        // revisión rutinaria (cada 15 min) sería puro ruido en el teléfono.
        if (totalPendiente > 0) {
            val quedaronFotos = if (photosAllowed) stillPendingPhotos else 0
            when {
                sessionReallyExpired ->
                    SyncNotifier.result(applicationContext, "Agra Campo", "Tu sesión terminó: entra de nuevo para subir lo que falta", ok = false)
                problems.isNotEmpty() ->
                    SyncNotifier.result(applicationContext, "Quedó algo sin subir", problems.first(), ok = false)
                quedaronFotos > 0 ->
                    SyncNotifier.result(
                        applicationContext, "Subida en curso",
                        "$quedaronFotos foto${if (quedaronFotos == 1) "" else "s"} sin subir todavía; la app lo sigue intentando",
                        ok = true,
                    )
                subidos > 0 || fotos > 0 ->
                    SyncNotifier.result(applicationContext, "Todo subido ✅", message, ok = true)
                else -> SyncNotifier.cancelProgress(applicationContext)
            }
        }

        // ── Bitácora ──
        // El resumen de ESTA corrida se registra antes de subir el lote, así
        // viaja de una vez en lugar de esperar a la siguiente sincronización.
        val segundos = ((System.currentTimeMillis() - inicio) / 1000).toInt()
        if (totalPendiente > 0 || problems.isNotEmpty()) {
            AppLogger.log(
                context = applicationContext,
                action = AppLogger.SYNC,
                screen = "Sincronización",
                detail = "$message · red $networkType · $subidos registro(s), $fotos foto(s)" +
                    if (stillPendingPhotos > 0) " · $stillPendingPhotos pendiente(s)" else "",
                durationSeconds = segundos,
            )
        }
        try {
            com.agratec.fieldapp.data.repository.AppLogRepository(applicationContext).push()
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo subir la bitácora", e)
        }

        return when {
            // Sesión muerta de verdad: reintentar no sirve, el usuario debe entrar
            sessionReallyExpired -> Result.failure()
            // 401 que sí se pudo renovar: reintentar para completar lo que faltó
            authFailed -> Result.retry()
            networkFailed -> Result.retry()
            else -> Result.success()
        }
    }
}
