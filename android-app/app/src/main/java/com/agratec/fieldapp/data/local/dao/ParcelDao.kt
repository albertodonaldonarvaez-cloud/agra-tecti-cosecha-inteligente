package com.agratec.fieldapp.data.local.dao

import androidx.room.*
import com.agratec.fieldapp.data.local.entity.ParcelEntity
import kotlinx.coroutines.flow.Flow

/**
 * DAO para parcelas cacheadas localmente.
 * Soporta operaciones de sincronización (replace all) y consulta offline.
 */
@Dao
interface ParcelDao {

    /** Obtener todas las parcelas como Flow reactivo */
    @Query("SELECT * FROM parcels ORDER BY name ASC")
    fun getAllParcels(): Flow<List<ParcelEntity>>

    /** Obtener todas las parcelas (suspend, no Flow) */
    @Query("SELECT * FROM parcels ORDER BY name ASC")
    suspend fun getAllParcelsList(): List<ParcelEntity>

    /** Obtener parcela por su ID del servidor */
    @Query("SELECT * FROM parcels WHERE serverId = :serverId LIMIT 1")
    suspend fun getByServerId(serverId: Int): ParcelEntity?

    /** Contar parcelas cacheadas */
    @Query("SELECT COUNT(*) FROM parcels")
    suspend fun getCount(): Int

    /** Insertar o reemplazar parcela */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(parcels: List<ParcelEntity>)

    /** Borrar todas las parcelas (antes de re-sync) */
    @Query("DELETE FROM parcels")
    suspend fun deleteAll()

    /** Reemplazar todas las parcelas con las nuevas del servidor */
    @Transaction
    suspend fun replaceAll(parcels: List<ParcelEntity>) {
        deleteAll()
        insertAll(parcels)
    }
}
