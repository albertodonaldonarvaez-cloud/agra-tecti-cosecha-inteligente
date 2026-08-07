package com.agratec.fieldapp.data.local.dao

import androidx.room.*
import com.agratec.fieldapp.data.local.entity.CollaboratorEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CollaboratorDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(collaborator: CollaboratorEntity): Long

    @Update
    suspend fun update(collaborator: CollaboratorEntity)

    @Query("SELECT * FROM collaborators_cache ORDER BY name ASC")
    fun getAll(): Flow<List<CollaboratorEntity>>

    @Query("SELECT * FROM collaborators_cache ORDER BY name ASC")
    suspend fun getAllList(): List<CollaboratorEntity>

    @Query("SELECT * FROM collaborators_cache WHERE isSynced = 0 AND syncAttempts < 8 ORDER BY id ASC LIMIT :limit")
    suspend fun getUnsynced(limit: Int = 20): List<CollaboratorEntity>

    @Query("SELECT COUNT(*) FROM collaborators_cache WHERE isSynced = 0")
    suspend fun getUnsyncedCount(): Int

    @Query("SELECT * FROM collaborators_cache WHERE clientUuid = :uuid LIMIT 1")
    suspend fun getByUuid(uuid: String): CollaboratorEntity?

    @Query("SELECT * FROM collaborators_cache WHERE serverId = :serverId LIMIT 1")
    suspend fun getByServerId(serverId: Int): CollaboratorEntity?

    @Query("UPDATE collaborators_cache SET isSynced = 1, serverId = :serverId, syncAttempts = 0, lastSyncError = NULL WHERE clientUuid = :uuid")
    suspend fun markAsSynced(uuid: String, serverId: Int?)

    @Query("UPDATE collaborators_cache SET syncAttempts = syncAttempts + 1, lastSyncError = :error WHERE clientUuid = :uuid")
    suspend fun markSyncFailed(uuid: String, error: String)

    @Query("DELETE FROM collaborators_cache WHERE id = :id")
    suspend fun deleteById(id: Long)

    /** Quitar del cache los colaboradores sincronizados que ya no existen/están activos en el servidor */
    @Query("DELETE FROM collaborators_cache WHERE isSynced = 1 AND serverId IS NOT NULL AND serverId NOT IN (:activeServerIds)")
    suspend fun deleteSyncedNotIn(activeServerIds: List<Int>)

    /** Dar otra oportunidad a los rechazados (sync manual del usuario) */
    @Query("UPDATE collaborators_cache SET syncAttempts = 0 WHERE isSynced = 0 AND syncAttempts >= 8")
    suspend fun resetFailedAttempts()
}
