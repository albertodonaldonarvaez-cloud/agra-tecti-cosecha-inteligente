package com.agratec.fieldapp.data.repository

import android.content.Context
import android.util.Log
import com.agratec.fieldapp.data.local.AppDatabase
import com.agratec.fieldapp.data.local.entity.ProductEntity
import com.agratec.fieldapp.data.remote.RetrofitClient
import com.agratec.fieldapp.data.remote.dto.SyncProductItem
import com.agratec.fieldapp.data.remote.dto.SyncProductsRequest
import com.agratec.fieldapp.data.remote.dto.TrpcMutationRequest
import com.agratec.fieldapp.sync.SyncWorker
import kotlinx.coroutines.flow.Flow
import java.util.UUID

/**
 * Almacén de productos — offline-first, con la misma mecánica del personal.
 *
 * Con red se baja el catálogo del servidor (así un producto dado de alta en
 * otro dispositivo aparece en todos); sin red se puede dar de alta un producto
 * y se sube solo en cuanto vuelve la señal.
 */
class ProductRepository(private val context: Context) {

    companion object {
        private const val TAG = "ProductRepo"

        /** Unidades de medida disponibles (mismas que el almacén de la web) */
        val UNITS = listOf(
            "kg" to "Kilogramos",
            "g" to "Gramos",
            "lt" to "Litros",
            "ml" to "Mililitros",
            "ton" to "Toneladas",
            "oz" to "Onzas",
            "lb" to "Libras",
            "gal" to "Galones",
            "bulto" to "Bultos",
            "saco" to "Sacos",
            "unidad" to "Unidades",
            "otro" to "Otra",
        )
        // (el orden de esta lista es solo de presentación; el ENUM del servidor
        //  tiene las unidades nuevas al final para no mover índices)

        /** Categorías del catálogo del almacén */
        val CATEGORIES = listOf(
            "fertilizante_granular" to "Fertilizante granular",
            "fertilizante_liquido" to "Fertilizante líquido",
            "fertilizante_foliar" to "Fertilizante foliar",
            "fertilizante_organico" to "Fertilizante orgánico",
            "herbicida_selectivo" to "Herbicida selectivo",
            "herbicida_no_selectivo" to "Herbicida no selectivo",
            "insecticida" to "Insecticida",
            "fungicida" to "Fungicida",
            "acaricida" to "Acaricida",
            "nematicida" to "Nematicida",
            "regulador_crecimiento" to "Regulador de crecimiento",
            "bioestimulante" to "Bioestimulante",
            "enmienda_suelo" to "Enmienda de suelo",
            "nutriente_foliar" to "Nutriente foliar",
            "agua" to "Agua",
            "otro" to "Otro",
        )

        fun unitLabel(value: String?): String =
            UNITS.find { it.first == value }?.second ?: (value ?: "kg")

        fun categoryLabel(value: String?): String =
            CATEGORIES.find { it.first == value }?.second ?: "Otro"
    }

    private val db = AppDatabase.getInstance(context)
    private val dao = db.productDao()

    fun getAll(): Flow<List<ProductEntity>> = dao.getAll()

    suspend fun getUnsyncedCount(): Int = dao.getUnsyncedCount()

    /** Alta local de un producto (se sube en el siguiente sync) */
    suspend fun addProduct(
        name: String,
        brand: String?,
        category: String,
        unit: String,
    ): ProductEntity {
        val entity = ProductEntity(
            clientUuid = UUID.randomUUID().toString(),
            name = name.trim().take(255),
            brand = brand?.trim()?.takeIf { it.isNotBlank() }?.take(255),
            category = category,
            unit = unit,
            isSynced = false,
        )
        dao.insert(entity)
        Log.i(TAG, "Producto creado localmente: ${entity.name}")
        SyncWorker.enqueueImmediateSync(context)
        return entity
    }

    /** Resultado de la subida, para que el worker pueda avisar al usuario */
    data class PushResult(val synced: Int, val httpCode: Int? = null, val problem: String? = null)

    /** Subir productos pendientes al servidor */
    suspend fun pushUnsynced(): PushResult {
        val unsynced = dao.getUnsynced()
        if (unsynced.isEmpty()) return PushResult(0)
        val api = RetrofitClient.getApiService(context)
        var synced = 0
        try {
            val response = api.syncProducts(
                TrpcMutationRequest(SyncProductsRequest(
                    products = unsynced.map {
                        SyncProductItem(
                            clientUuid = it.clientUuid,
                            name = it.name.take(255),
                            brand = it.brand?.take(255),
                            category = it.category,
                            unit = it.unit,
                        )
                    }
                ))
            )
            if (response.isSuccessful) {
                response.body()?.result?.data?.json?.results?.forEach { r ->
                    if (r.status != "error") {
                        dao.markAsSynced(r.clientUuid, r.serverId)
                        synced++
                    } else {
                        dao.markSyncFailed(r.clientUuid, r.error ?: "Error desconocido")
                    }
                }
                return PushResult(synced)
            }

            // Fallo HTTP: contabilizar el intento en CADA producto, si no
            // quedarían pendientes para siempre
            val problem = when (response.code()) {
                401 -> "Tu sesión expiró: vuelve a iniciar sesión"
                404 -> "El servidor no tiene soporte para el almacén (falta actualizarlo)"
                else -> "No se pudieron subir los productos (código ${response.code()})"
            }
            for (p in unsynced) dao.markSyncFailed(p.clientUuid, "HTTP ${response.code()}")
            Log.w(TAG, "Error HTTP subiendo productos: ${response.code()}")
            return PushResult(synced, response.code(), problem)
        } catch (e: Exception) {
            Log.e(TAG, "Error subiendo productos", e)
            for (p in unsynced) dao.markSyncFailed(p.clientUuid, e.message ?: "Sin conexión")
            return PushResult(synced, null, "Sin conexión al subir los productos")
        }
    }

    /**
     * Bajar el catálogo del servidor y fundirlo con el cache local.
     * Los productos locales sin sincronizar no se tocan.
     */
    suspend fun pullFromServer(): Boolean {
        return try {
            val api = RetrofitClient.getApiService(context)
            val response = api.getProducts()
            if (!response.isSuccessful) return false
            val remote = response.body()?.result?.data?.json ?: return false

            for (r in remote) {
                val local = dao.getByServerId(r.id)
                if (local == null) {
                    dao.insert(
                        ProductEntity(
                            clientUuid = UUID.randomUUID().toString(),
                            serverId = r.id,
                            name = r.name,
                            brand = r.brand,
                            category = r.category ?: "otro",
                            unit = r.unit ?: "kg",
                            isSynced = true,
                        )
                    )
                } else if (local.isSynced) {
                    dao.update(
                        local.copy(
                            name = r.name,
                            brand = r.brand,
                            category = r.category ?: local.category,
                            unit = r.unit ?: local.unit,
                        )
                    )
                }
            }

            // Quitar los dados de baja en la web. La respuesta llegó bien, así
            // que una lista vacía significa de verdad "el almacén quedó vacío":
            // también hay que reflejarlo. Lo pendiente de subir no se toca.
            val activeIds = remote.map { it.id }
            if (activeIds.isEmpty()) dao.deleteAllSynced() else dao.deleteSyncedNotIn(activeIds)

            Log.i(TAG, "Productos sincronizados: ${remote.size}")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error bajando productos", e)
            false
        }
    }
}
