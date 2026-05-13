package com.agratec.fieldapp.data.repository

import android.content.Context
import android.util.Log
import com.agratec.fieldapp.data.local.AppDatabase
import com.agratec.fieldapp.data.local.entity.ParcelEntity
import com.agratec.fieldapp.data.remote.RetrofitClient
import kotlinx.coroutines.flow.Flow

/**
 * Repositorio de parcelas — offline-first.
 *
 * Flujo:
 * 1. Al abrir la pantalla, se observan parcelas desde Room (Flow reactivo)
 * 2. En paralelo, intenta descargar parcelas actualizadas del servidor
 * 3. Si hay internet, reemplaza el cache local con las nuevas
 * 4. Si no hay internet, la UI usa el cache existente
 *
 * Las parcelas se sincronizan también desde el SyncWorker periódico.
 */
class ParcelRepository(private val context: Context) {

    companion object {
        private const val TAG = "ParcelRepository"
    }

    private val db = AppDatabase.getInstance(context)
    private val parcelDao = db.parcelDao()

    /** Observar parcelas locales (Flow reactivo para UI) */
    fun getAllParcels(): Flow<List<ParcelEntity>> = parcelDao.getAllParcels()

    /** Obtener parcelas locales (suspend) */
    suspend fun getLocalParcels(): List<ParcelEntity> = parcelDao.getAllParcelsList()

    /** Contar parcelas en cache */
    suspend fun getCachedCount(): Int = parcelDao.getCount()

    /**
     * Sincronizar parcelas desde el servidor.
     * Retorna true si se actualizó el cache, false si no había internet o falló.
     */
    suspend fun syncFromServer(): Boolean {
        return try {
            if (!RetrofitClient.isLoggedIn(context)) {
                Log.w(TAG, "No hay sesión activa, omitiendo sync de parcelas")
                return false
            }

            val api = RetrofitClient.getApiService(context)
            val response = api.getParcels()

            if (response.isSuccessful) {
                val body = response.body()
                if (body?.success == true && body.parcels != null) {
                    // Convertir DTOs a entidades Room
                    val entities = body.parcels.map { dto ->
                        ParcelEntity(
                            serverId = dto.id,
                            code = dto.code,
                            name = dto.name,
                        )
                    }

                    // Reemplazar cache local
                    parcelDao.replaceAll(entities)
                    Log.i(TAG, "Parcelas sincronizadas: ${entities.size}")
                    return true
                }
            } else {
                Log.w(TAG, "Error HTTP al sincronizar parcelas: ${response.code()}")
            }
            false
        } catch (e: Exception) {
            Log.e(TAG, "Error de red al sincronizar parcelas", e)
            false
        }
    }
}
