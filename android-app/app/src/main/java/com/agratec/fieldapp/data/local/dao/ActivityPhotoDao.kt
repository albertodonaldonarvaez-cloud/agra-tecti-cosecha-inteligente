package com.agratec.fieldapp.data.local.dao

import androidx.room.*
import com.agratec.fieldapp.data.local.entity.ActivityPhotoEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ActivityPhotoDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(photo: ActivityPhotoEntity): Long

    @Query("SELECT * FROM activity_photos WHERE activityClientUuid = :activityUuid ORDER BY id ASC")
    fun getForActivity(activityUuid: String): Flow<List<ActivityPhotoEntity>>

    @Query("SELECT COUNT(*) FROM activity_photos WHERE activityClientUuid = :activityUuid")
    suspend fun countForActivity(activityUuid: String): Int

    /**
     * Fotos pendientes de subir cuya actividad YA está sincronizada
     * (el servidor necesita conocer la actividad antes de aceptar su foto).
     */
    @Query("""
        SELECT p.* FROM activity_photos p
        INNER JOIN field_activities a ON a.clientUuid = p.activityClientUuid
        WHERE p.isSynced = 0 AND p.syncAttempts < 8 AND a.serverId IS NOT NULL
        ORDER BY p.id ASC LIMIT :limit
    """)
    suspend fun getUnsyncedUploadable(limit: Int = 10): List<ActivityPhotoEntity>

    @Query("SELECT COUNT(*) FROM activity_photos WHERE isSynced = 0")
    suspend fun getUnsyncedCount(): Int

    @Query("UPDATE activity_photos SET isSynced = 1, syncAttempts = 0, lastSyncError = NULL WHERE localPhotoId = :localPhotoId")
    suspend fun markAsSynced(localPhotoId: String)

    @Query("UPDATE activity_photos SET syncAttempts = syncAttempts + 1, lastSyncError = :error WHERE localPhotoId = :localPhotoId")
    suspend fun markSyncFailed(localPhotoId: String, error: String)

    @Query("DELETE FROM activity_photos WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("DELETE FROM activity_photos WHERE activityClientUuid = :activityUuid")
    suspend fun deleteForActivity(activityUuid: String)

    /** Dar otra oportunidad a las fotos rechazadas (sync manual del usuario) */
    @Query("UPDATE activity_photos SET syncAttempts = 0 WHERE isSynced = 0 AND syncAttempts >= 8")
    suspend fun resetFailedAttempts()
}
