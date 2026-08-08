package com.agratec.fieldapp.data.local.dao

import androidx.room.*
import com.agratec.fieldapp.data.local.entity.ProductEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ProductDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(product: ProductEntity): Long

    @Update
    suspend fun update(product: ProductEntity)

    @Query("SELECT * FROM products_cache ORDER BY name ASC")
    fun getAll(): Flow<List<ProductEntity>>

    @Query("SELECT * FROM products_cache ORDER BY name ASC")
    suspend fun getAllList(): List<ProductEntity>

    @Query("SELECT * FROM products_cache WHERE isSynced = 0 AND syncAttempts < 8 ORDER BY id ASC LIMIT :limit")
    suspend fun getUnsynced(limit: Int = 20): List<ProductEntity>

    @Query("SELECT COUNT(*) FROM products_cache WHERE isSynced = 0")
    suspend fun getUnsyncedCount(): Int

    @Query("SELECT * FROM products_cache WHERE clientUuid = :uuid LIMIT 1")
    suspend fun getByUuid(uuid: String): ProductEntity?

    @Query("SELECT * FROM products_cache WHERE serverId = :serverId LIMIT 1")
    suspend fun getByServerId(serverId: Int): ProductEntity?

    @Query("UPDATE products_cache SET isSynced = 1, serverId = :serverId, syncAttempts = 0, lastSyncError = NULL WHERE clientUuid = :uuid")
    suspend fun markAsSynced(uuid: String, serverId: Int?)

    @Query("UPDATE products_cache SET syncAttempts = syncAttempts + 1, lastSyncError = :error WHERE clientUuid = :uuid")
    suspend fun markSyncFailed(uuid: String, error: String)

    @Query("DELETE FROM products_cache WHERE id = :id")
    suspend fun deleteById(id: Long)

    /** Quitar del cache los productos sincronizados que ya no están activos en el servidor */
    @Query("DELETE FROM products_cache WHERE isSynced = 1 AND serverId IS NOT NULL AND serverId NOT IN (:activeServerIds)")
    suspend fun deleteSyncedNotIn(activeServerIds: List<Int>)

    /** El servidor ya no tiene productos activos: se vacía el cache (lo pendiente de subir se conserva) */
    @Query("DELETE FROM products_cache WHERE isSynced = 1 AND serverId IS NOT NULL")
    suspend fun deleteAllSynced()

    /** Dar otra oportunidad a los rechazados (sync manual del usuario) */
    @Query("UPDATE products_cache SET syncAttempts = 0 WHERE isSynced = 0 AND syncAttempts >= 8")
    suspend fun resetFailedAttempts()
}
