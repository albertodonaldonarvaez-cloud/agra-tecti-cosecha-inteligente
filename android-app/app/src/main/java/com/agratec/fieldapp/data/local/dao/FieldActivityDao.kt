package com.agratec.fieldapp.data.local.dao

import androidx.room.*
import com.agratec.fieldapp.data.local.entity.FieldActivityEntity
import kotlinx.coroutines.flow.Flow

/**
 * DAO para actividades de la libreta de campo.
 * Mismo patrón offline-first que [FieldNoteDao]:
 * - [getUnsynced]: batch de actividades con cambios locales pendientes
 * - [markAsSynced]: marca sincronizada y guarda el id del servidor
 * - [getAll]: Flow reactivo para la UI
 */
@Dao
interface FieldActivityDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(activity: FieldActivityEntity): Long

    @Update
    suspend fun update(activity: FieldActivityEntity)

    /** Todas las actividades, próximas/recientes primero */
    @Query("SELECT * FROM field_activities ORDER BY activityDate DESC, id DESC")
    fun getAll(): Flow<List<FieldActivityEntity>>

    /**
     * Actividades con cambios locales sin subir.
     * Las que fallaron 8+ veces se excluyen para que un registro rechazado
     * por el servidor no bloquee la cola para siempre.
     */
    @Query("SELECT * FROM field_activities WHERE isSynced = 0 AND syncAttempts < 8 ORDER BY id ASC LIMIT :limit")
    suspend fun getUnsynced(limit: Int = 10): List<FieldActivityEntity>

    @Query("SELECT COUNT(*) FROM field_activities WHERE isSynced = 0")
    suspend fun getUnsyncedCount(): Int

    /**
     * Marca sincronizada SOLO si el estado no cambió mientras la subida estaba
     * en vuelo (evita perder un cambio hecho durante el request).
     */
    @Query("UPDATE field_activities SET isSynced = 1, serverId = :serverId, syncAttempts = 0, lastSyncError = NULL WHERE clientUuid = :uuid AND status = :uploadedStatus")
    suspend fun markAsSyncedIfStatus(uuid: String, serverId: Int?, uploadedStatus: String)

    @Query("UPDATE field_activities SET syncAttempts = syncAttempts + 1, lastSyncError = :error WHERE clientUuid = :uuid")
    suspend fun markSyncFailed(uuid: String, error: String)

    @Query("SELECT * FROM field_activities WHERE clientUuid = :uuid LIMIT 1")
    suspend fun getByUuid(uuid: String): FieldActivityEntity?

    @Query("SELECT * FROM field_activities WHERE serverId = :serverId LIMIT 1")
    suspend fun getByServerId(serverId: Int): FieldActivityEntity?

    /** Cambiar estado localmente (queda pendiente de sincronizar) */
    @Query("UPDATE field_activities SET status = :status, isSynced = 0 WHERE clientUuid = :uuid")
    suspend fun updateStatus(uuid: String, status: String)

    @Query("DELETE FROM field_activities WHERE id = :id")
    suspend fun deleteById(id: Long)

    /** Eliminar una actividad que fue borrada en la web (evita fantasmas) */
    @Query("DELETE FROM field_activities WHERE clientUuid = :uuid")
    suspend fun deleteByUuid(uuid: String)

    /** Dar otra oportunidad a los registros rechazados (sync manual del usuario) */
    @Query("UPDATE field_activities SET syncAttempts = 0 WHERE isSynced = 0 AND syncAttempts >= 8")
    suspend fun resetFailedAttempts()

    @Query("SELECT COUNT(*) FROM field_activities")
    suspend fun getTotalCount(): Int
}
