package com.agratec.fieldapp.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.agratec.fieldapp.data.local.entity.AppLogEntity

@Dao
interface AppLogDao {

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(log: AppLogEntity): Long

    @Query("SELECT * FROM app_logs WHERE isSynced = 0 AND syncAttempts < 5 ORDER BY id ASC LIMIT :limit")
    suspend fun getUnsynced(limit: Int = 200): List<AppLogEntity>

    @Query("SELECT COUNT(*) FROM app_logs WHERE isSynced = 0")
    suspend fun getUnsyncedCount(): Int

    @Query("DELETE FROM app_logs WHERE clientLogId IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)

    @Query("UPDATE app_logs SET syncAttempts = syncAttempts + 1 WHERE clientLogId IN (:ids)")
    suspend fun markFailed(ids: List<String>)

    /**
     * Red de seguridad: si un teléfono pasa meses sin subir (o el servidor
     * rechaza siempre), la bitácora no puede crecer para siempre. Se conservan
     * los eventos más recientes y se tiran los viejos.
     */
    @Query("DELETE FROM app_logs WHERE id NOT IN (SELECT id FROM app_logs ORDER BY id DESC LIMIT :keep)")
    suspend fun trimTo(keep: Int)

    @Query("SELECT COUNT(*) FROM app_logs")
    suspend fun total(): Int
}
