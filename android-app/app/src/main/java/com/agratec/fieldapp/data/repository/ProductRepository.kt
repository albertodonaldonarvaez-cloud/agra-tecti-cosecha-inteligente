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
import com.agratec.fieldapp.util.AppLogger
import com.agratec.fieldapp.util.ImageProcessor
import kotlinx.coroutines.flow.Flow
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
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

    private fun limpia(v: String?, max: Int): String? =
        v?.trim()?.takeIf { it.isNotBlank() }?.take(max)

    /** Alta local de un producto (se sube en el siguiente sync) */
    suspend fun addProduct(
        name: String,
        brand: String?,
        category: String,
        unit: String,
        description: String? = null,
        activeIngredient: String? = null,
        concentration: String? = null,
        presentation: String? = null,
        storageLocation: String? = null,
    ): ProductEntity {
        val entity = ProductEntity(
            clientUuid = UUID.randomUUID().toString(),
            name = name.trim().take(255),
            brand = limpia(brand, 255),
            category = category,
            unit = unit,
            description = limpia(description, 1000),
            activeIngredient = limpia(activeIngredient, 255),
            concentration = limpia(concentration, 128),
            presentation = limpia(presentation, 128),
            storageLocation = limpia(storageLocation, 255),
            isSynced = false,
        )
        dao.insert(entity)
        Log.i(TAG, "Producto creado localmente: ${entity.name}")
        AppLogger.log(context, AppLogger.PRODUCT_CREATE, "Almacén", "Alta de producto: ${entity.name}")
        SyncWorker.enqueueImmediateSync(context)
        return entity
    }

    /**
     * Editar un producto ya existente (incluidos los que nacieron en la web).
     * Queda marcado como isDirty y el cambio viaja en la siguiente sincronización.
     */
    suspend fun updateProduct(
        product: ProductEntity,
        name: String,
        brand: String?,
        category: String,
        unit: String,
        description: String?,
        activeIngredient: String?,
        concentration: String?,
        presentation: String?,
        storageLocation: String?,
    ) {
        dao.update(
            product.copy(
                name = name.trim().take(255),
                brand = limpia(brand, 255),
                category = category,
                unit = unit,
                description = limpia(description, 1000),
                activeIngredient = limpia(activeIngredient, 255),
                concentration = limpia(concentration, 128),
                presentation = limpia(presentation, 128),
                storageLocation = limpia(storageLocation, 255),
                isDirty = true,
                syncAttempts = 0,
                lastSyncError = null,
            )
        )
        Log.i(TAG, "Producto editado localmente: ${product.name}")
        AppLogger.log(context, AppLogger.PRODUCT_UPDATE, "Almacén", "Edición de producto: ${name.take(120)}")
        SyncWorker.enqueueImmediateSync(context)
    }

    /**
     * Guardar la foto del producto tomada (o elegida) en el teléfono.
     * Se comprime aquí mismo: una foto de envase de 4 MB no tiene por qué
     * gastar los datos de la cuadrilla.
     */
    suspend fun setPhoto(clientUuid: String, path: String) {
        // Se relee el producto: si venía de una edición recién guardada, la
        // copia que tenía la pantalla ya está vieja y pisaría los cambios
        val product = dao.getByUuid(clientUuid) ?: return
        val result = ImageProcessor.compress(path, dataSaver = true)
        dao.update(product.copy(localPhotoPath = path, photoDirty = true, syncAttempts = 0))
        AppLogger.logPhoto(context, "Almacén", result, "producto: ${product.name.take(60)}")
        SyncWorker.enqueueImmediateSync(context)
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
                            serverId = it.serverId,
                            name = it.name.take(255),
                            brand = it.brand?.take(255),
                            category = it.category,
                            unit = it.unit,
                            description = it.description?.take(1000),
                            activeIngredient = it.activeIngredient?.take(255),
                            concentration = it.concentration?.take(128),
                            presentation = it.presentation?.take(128),
                            storageLocation = it.storageLocation?.take(255),
                        )
                    }
                ))
            )
            if (response.isSuccessful) {
                response.body()?.result?.data?.json?.results?.forEach { r ->
                    when {
                        // Lo borraron en la web mientras el teléfono no tenía señal
                        r.status == "deleted" -> {
                            dao.getByUuid(r.clientUuid)?.let { dao.deleteById(it.id) }
                            Log.i(TAG, "Producto ${r.clientUuid} eliminado en la web")
                        }
                        r.status != "error" -> {
                            dao.markAsSynced(r.clientUuid, r.serverId)
                            synced++
                        }
                        else -> dao.markSyncFailed(r.clientUuid, r.error ?: "Error desconocido")
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
                            clientUuid = r.clientUuid ?: UUID.randomUUID().toString(),
                            serverId = r.id,
                            name = r.name,
                            brand = r.brand,
                            category = r.category ?: "otro",
                            unit = r.unit ?: "kg",
                            description = r.description,
                            activeIngredient = r.activeIngredient,
                            concentration = r.concentration,
                            presentation = r.presentation,
                            storageLocation = r.storageLocation,
                            photoUrl = r.photoUrl,
                            isSynced = true,
                        )
                    )
                } else if (local.isSynced && !local.isDirty) {
                    // Si hay una edición pendiente en el teléfono no se pisa: el
                    // pull traería el estado viejo y borraría el trabajo del campo
                    dao.update(
                        local.copy(
                            name = r.name,
                            brand = r.brand,
                            category = r.category ?: local.category,
                            unit = r.unit ?: local.unit,
                            description = r.description,
                            activeIngredient = r.activeIngredient,
                            concentration = r.concentration,
                            presentation = r.presentation,
                            storageLocation = r.storageLocation,
                            photoUrl = if (local.photoDirty) local.photoUrl else r.photoUrl,
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

    /**
     * Subir las fotos de producto pendientes.
     * Solo se intentan las de productos que ya tienen serverId: si el producto
     * todavía no sube, la foto espera al siguiente intento.
     */
    suspend fun pushPhotos(): Int {
        val pendientes = dao.getPendingPhotos()
        if (pendientes.isEmpty()) return 0
        val api = RetrofitClient.getApiService(context)
        var subidas = 0
        for (p in pendientes) {
            val path = p.localPhotoPath ?: continue
            try {
                val file = File(path)
                if (!file.exists()) {
                    // El archivo ya no está (limpieza del teléfono): se olvida
                    dao.update(p.copy(localPhotoPath = null, photoDirty = false))
                    continue
                }
                val body = file.asRequestBody("image/jpeg".toMediaTypeOrNull())
                val response = api.uploadProductPhoto(
                    photo = MultipartBody.Part.createFormData("photo", file.name, body),
                    clientUuid = p.clientUuid.toRequestBody("text/plain".toMediaTypeOrNull()),
                    serverId = p.serverId?.toString()?.toRequestBody("text/plain".toMediaTypeOrNull()),
                    originalBytes = file.length().toString().toRequestBody("text/plain".toMediaTypeOrNull()),
                )
                if (response.isSuccessful && response.body()?.success == true) {
                    dao.markPhotoSynced(p.clientUuid, response.body()?.photoUrl)
                    subidas++
                    AppLogger.log(
                        context, AppLogger.PHOTO_UPLOAD, "Almacén",
                        "Foto de producto subida: " + p.name.take(120),
                        finalBytes = file.length(),
                    )
                } else {
                    dao.markSyncFailed(p.clientUuid, response.body()?.error ?: "HTTP ${response.code()}")
                }
            } catch (e: Exception) {
                Log.w(TAG, "No se pudo subir la foto de ${p.name}", e)
                dao.markSyncFailed(p.clientUuid, e.message ?: "Sin conexión")
            }
        }
        return subidas
    }

    suspend fun getPendingPhotoCount(): Int = dao.getPendingPhotoCount()
}
