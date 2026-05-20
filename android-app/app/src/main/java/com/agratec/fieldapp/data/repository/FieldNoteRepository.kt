package com.agratec.fieldapp.data.repository

import android.content.Context
import android.util.Log
import com.agratec.fieldapp.data.local.AppDatabase
import com.agratec.fieldapp.data.local.entity.FieldNoteEntity
import com.agratec.fieldapp.data.local.entity.PhotoEntity
import kotlinx.coroutines.flow.Flow
import java.time.Instant
import java.util.UUID

/**
 * Repositorio de notas de campo — punto único de acceso a datos.
 * Implementa patrón offline-first:
 * 1. Siempre guarda en Room primero (disponible inmediatamente)
 * 2. El SyncWorker se encarga de enviar al servidor en background
 *
 * La UI observa datos desde Room (Flow reactivo), sin importar
 * si están sincronizados o no. Esto garantiza una experiencia
 * fluida incluso sin internet.
 */
class FieldNoteRepository(context: Context) {

    companion object {
        private const val TAG = "FieldNoteRepository"
    }

    private val db = AppDatabase.getInstance(context)
    private val noteDao = db.fieldNoteDao()
    private val photoDao = db.photoDao()

    // ============================================
    // NOTAS DE CAMPO
    // ============================================

    /** Obtener todas las notas (Flow reactivo para UI) */
    fun getAllNotes(): Flow<List<FieldNoteEntity>> = noteDao.getAllNotes()

    /** Crear una nueva nota de campo (se guarda localmente, sync pendiente) */
    suspend fun createNote(
        description: String,
        category: String,
        severity: String = "media",
        parcelId: Int? = null,
        latitude: Double? = null,
        longitude: Double? = null,
        photoUri: String? = null,
    ): FieldNoteEntity {
        val note = FieldNoteEntity(
            folio = UUID.randomUUID().toString(),
            description = description,
            category = category,
            severity = severity,
            parcelId = parcelId,
            latitude = latitude,
            longitude = longitude,
            createdAtLocal = Instant.now().toString(),
            isSynced = false,
        )
        noteDao.insert(note)
        Log.i(TAG, "Nota creada localmente: ${note.folio}")

        // If a photo was captured, create the linked PhotoEntity
        if (photoUri != null) {
            addPhoto(
                fieldNoteFolio = note.folio,
                localFilePath = photoUri,
                caption = "Foto de campo",
            )
        }

        return note
    }

    /** Obtener nota por folio */
    suspend fun getNoteByFolio(folio: String): FieldNoteEntity? = noteDao.getByFolio(folio)

    /** Eliminar nota por ID */
    suspend fun deleteNote(id: Long) = noteDao.deleteById(id)

    /** Contar notas pendientes de sync */
    suspend fun getUnsyncedNoteCount(): Int = noteDao.getUnsyncedCount()

    // ============================================
    // FOTOS
    // ============================================

    /** Agregar foto a una nota de campo */
    suspend fun addPhoto(
        fieldNoteFolio: String,
        localFilePath: String,
        caption: String? = null,
    ): PhotoEntity {
        val photo = PhotoEntity(
            localPhotoId = UUID.randomUUID().toString(),
            fieldNoteFolio = fieldNoteFolio,
            localFilePath = localFilePath,
            caption = caption,
            createdAtLocal = Instant.now().toString(),
            isSynced = false,
        )
        photoDao.insert(photo)
        Log.i(TAG, "Foto agregada localmente: ${photo.localPhotoId} -> $fieldNoteFolio")
        return photo
    }

    /** Obtener fotos de una nota (Flow reactivo) */
    fun getPhotosForNote(folio: String): Flow<List<PhotoEntity>> = photoDao.getPhotosForNote(folio)

    /** Contar fotos pendientes de sync */
    suspend fun getUnsyncedPhotoCount(): Int = photoDao.getUnsyncedCount()

    // ============================================
    // ESTADÍSTICAS DE SYNC
    // ============================================

    /** Resumen de estado de sincronización */
    suspend fun getSyncStatus(): SyncStatus {
        return SyncStatus(
            totalNotes = noteDao.getTotalCount(),
            unsyncedNotes = noteDao.getUnsyncedCount(),
            unsyncedPhotos = photoDao.getUnsyncedCount(),
            failedPhotos = photoDao.getFailedCount(),
        )
    }

    /** Resetear fotos fallidas para reintentar subida */
    suspend fun resetFailedPhotos(): Int {
        val count = photoDao.resetAllFailed()
        Log.i(TAG, "Reseteadas $count fotos fallidas para reintento")
        return count
    }

    /** Contar fotos con errores de sync */
    suspend fun getFailedPhotoCount(): Int = photoDao.getFailedCount()

    /**
     * Ejecutar diagnóstico completo de fotos para la UI.
     * Retorna un informe detallado de por qué las fotos no se suben.
     */
    suspend fun runPhotoDiagnostics(): PhotoDiagnostics {
        val totalUnsynced = photoDao.getUnsyncedCount()
        val readyToUpload = photoDao.getReadyToUploadCount()
        val blockedByNote = photoDao.getBlockedByNoteCount()
        val orphaned = photoDao.getOrphanedCount()
        val failed = photoDao.getFailedCount()

        // Verificar archivos locales de muestra
        val samplePhotos = photoDao.getSampleUnsyncedPhotos()
        val fileChecks = samplePhotos.map { photo ->
            val file = java.io.File(photo.localFilePath)
            PhotoFileCheck(
                photoId = photo.localPhotoId.take(8),
                folio = photo.fieldNoteFolio.take(8),
                path = photo.localFilePath,
                exists = file.exists(),
                sizeKB = if (file.exists()) (file.length() / 1024).toInt() else 0,
                syncAttempts = photo.syncAttempts,
                lastError = photo.lastSyncError,
            )
        }

        return PhotoDiagnostics(
            totalUnsynced = totalUnsynced,
            readyToUpload = readyToUpload,
            blockedByNote = blockedByNote,
            orphaned = orphaned,
            failed = failed,
            fileChecks = fileChecks,
        )
    }
}

data class PhotoDiagnostics(
    val totalUnsynced: Int,
    val readyToUpload: Int,
    val blockedByNote: Int,
    val orphaned: Int,
    val failed: Int,
    val fileChecks: List<PhotoFileCheck>,
) {
    val filesExist: Int get() = fileChecks.count { it.exists }
    val filesMissing: Int get() = fileChecks.count { !it.exists }
}

data class PhotoFileCheck(
    val photoId: String,
    val folio: String,
    val path: String,
    val exists: Boolean,
    val sizeKB: Int,
    val syncAttempts: Int,
    val lastError: String?,
)

data class SyncStatus(
    val totalNotes: Int,
    val unsyncedNotes: Int,
    val unsyncedPhotos: Int,
    val failedPhotos: Int = 0,
) {
    val hasPendingSync: Boolean get() = unsyncedNotes > 0 || unsyncedPhotos > 0
    val allSynced: Boolean get() = unsyncedNotes == 0 && unsyncedPhotos == 0
}
