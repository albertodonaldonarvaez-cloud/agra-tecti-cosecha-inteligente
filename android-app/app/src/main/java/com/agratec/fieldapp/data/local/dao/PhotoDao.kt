package com.agratec.fieldapp.data.local.dao

import androidx.room.*
import com.agratec.fieldapp.data.local.entity.PhotoEntity
import kotlinx.coroutines.flow.Flow

/**
 * DAO para fotos asociadas a notas de campo.
 * Las fotos se suben una por una al endpoint REST /api/sync/photo
 * usando multipart/form-data.
 */
@Dao
interface PhotoDao {

    /** Insertar una foto (o reemplazar si localPhotoId ya existe) */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(photo: PhotoEntity): Long

    /** Obtener fotos NO sincronizadas, solo de notas que YA están sincronizadas */
    @Query("""
        SELECT p.* FROM photos p
        INNER JOIN field_notes n ON p.fieldNoteFolio = n.folio
        WHERE p.isSynced = 0 AND n.isSynced = 1
        ORDER BY p.id ASC
        LIMIT :limit
    """)
    suspend fun getUnsyncedPhotos(limit: Int = 5): List<PhotoEntity>

    /** Contar fotos pendientes de sincronización */
    @Query("SELECT COUNT(*) FROM photos WHERE isSynced = 0")
    suspend fun getUnsyncedCount(): Int

    /** Marcar foto como sincronizada */
    @Query("UPDATE photos SET isSynced = 1, syncAttempts = 0, lastSyncError = NULL WHERE localPhotoId = :localPhotoId")
    suspend fun markAsSynced(localPhotoId: String)

    /** Registrar intento fallido */
    @Query("UPDATE photos SET syncAttempts = syncAttempts + 1, lastSyncError = :error WHERE localPhotoId = :localPhotoId")
    suspend fun markSyncFailed(localPhotoId: String, error: String)

    /** Obtener fotos de una nota específica */
    @Query("SELECT * FROM photos WHERE fieldNoteFolio = :folio ORDER BY id ASC")
    fun getPhotosForNote(folio: String): Flow<List<PhotoEntity>>

    /** Contar fotos de una nota */
    @Query("SELECT COUNT(*) FROM photos WHERE fieldNoteFolio = :folio")
    suspend fun getPhotoCountForNote(folio: String): Int
}
