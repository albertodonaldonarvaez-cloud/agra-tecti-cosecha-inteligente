package com.agratec.fieldapp.data.repository

import android.content.Context
import android.util.Log
import com.agratec.fieldapp.data.local.AppDatabase
import com.agratec.fieldapp.data.local.entity.CollaboratorEntity
import com.agratec.fieldapp.data.prefs.CatalogPreferences
import com.agratec.fieldapp.data.remote.RetrofitClient
import com.agratec.fieldapp.sync.SyncWorker
import com.agratec.fieldapp.data.remote.dto.SyncCollaboratorItem
import com.agratec.fieldapp.data.remote.dto.SyncCollaboratorsRequest
import com.agratec.fieldapp.data.remote.dto.TrpcMutationRequest
import kotlinx.coroutines.flow.Flow
import java.util.UUID

/**
 * Colaboradores de campo — offline-first.
 * Alta desde el teléfono (para poder asignar "quién lo hizo" en las
 * actividades) + cache de los colaboradores del servidor.
 */
class CollaboratorRepository(private val context: Context) {

    companion object {
        private const val TAG = "CollaboratorRepo"
    }

    private val db = AppDatabase.getInstance(context)
    private val dao = db.collaboratorDao()

    fun getAll(): Flow<List<CollaboratorEntity>> = dao.getAll()

    suspend fun getUnsyncedCount(): Int = dao.getUnsyncedCount()

    /** Alta local de un colaborador (se sube en el siguiente sync) */
    suspend fun addCollaborator(
        name: String,
        role: String?,
        phone: String? = null,
    ): CollaboratorEntity {
        val cleanRole = role?.trim()?.takeIf { it.isNotBlank() }
        val entity = CollaboratorEntity(
            clientUuid = UUID.randomUUID().toString(),
            name = name.trim(),
            role = cleanRole,
            phone = phone?.trim()?.takeIf { it.isNotBlank() },
            isSynced = false,
        )
        dao.insert(entity)
        // Un puesto capturado con "Otro" entra al catálogo local de inmediato,
        // aunque no haya señal; el servidor lo registra al sincronizar
        cleanRole?.let { CatalogPreferences.addRole(context, it) }
        Log.i(TAG, "Colaborador creado localmente: ${entity.name}")
        SyncWorker.enqueueImmediateSync(context)
        return entity
    }

    /** Editar un colaborador local (queda pendiente de subir) */
    suspend fun updateCollaborator(
        clientUuid: String,
        name: String,
        role: String?,
        phone: String?,
    ) {
        val local = dao.getByUuid(clientUuid) ?: return
        val cleanRole = role?.trim()?.takeIf { it.isNotBlank() }
        dao.update(
            local.copy(
                name = name.trim(),
                role = cleanRole,
                phone = phone?.trim()?.takeIf { it.isNotBlank() },
                isSynced = false,
                syncAttempts = 0,
                lastSyncError = null,
            )
        )
        cleanRole?.let { CatalogPreferences.addRole(context, it) }
        SyncWorker.enqueueImmediateSync(context)
    }

    /** Catálogo de puestos disponible en el teléfono (offline incluido) */
    fun roles(): List<String> = CatalogPreferences.roles(context)

    /** Bajar el catálogo de puestos del servidor (no crítico: si falla se usa el local) */
    suspend fun pullRoles(): Boolean {
        return try {
            val api = RetrofitClient.getApiService(context)
            val response = api.getCollaboratorRoles()
            if (!response.isSuccessful) return false
            val roles = response.body()?.result?.data?.json ?: return false
            CatalogPreferences.setRolesFromServer(context, roles.map { it.name })
            true
        } catch (e: Exception) {
            Log.d(TAG, "Catálogo de puestos no disponible: ${e.message}")
            false
        }
    }

    /** Resultado de la subida, para que el worker pueda avisar al usuario */
    data class PushResult(val synced: Int, val httpCode: Int? = null, val problem: String? = null)

    /** Subir colaboradores pendientes al servidor */
    suspend fun pushUnsynced(): PushResult {
        val unsynced = dao.getUnsynced()
        if (unsynced.isEmpty()) return PushResult(0)
        val api = RetrofitClient.getApiService(context)
        var synced = 0
        try {
            val response = api.syncCollaborators(
                TrpcMutationRequest(SyncCollaboratorsRequest(
                    collaborators = unsynced.map {
                        SyncCollaboratorItem(
                            clientUuid = it.clientUuid,
                            name = it.name.take(255),
                            phone = it.phone?.take(32),
                            role = it.role?.take(128),
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

            // Fallo HTTP: contabilizar el intento en CADA colaborador, si no
            // quedarían pendientes para siempre bloqueando a sus actividades
            val problem = when (response.code()) {
                401 -> "Tu sesión expiró: vuelve a iniciar sesión"
                404 -> "El servidor no tiene soporte para colaboradores (falta actualizarlo)"
                else -> "No se pudieron subir los colaboradores (código ${response.code()})"
            }
            for (c in unsynced) dao.markSyncFailed(c.clientUuid, "HTTP ${response.code()}")
            Log.w(TAG, "Error HTTP subiendo colaboradores: ${response.code()}")
            return PushResult(synced, response.code(), problem)
        } catch (e: Exception) {
            Log.e(TAG, "Error subiendo colaboradores", e)
            for (c in unsynced) dao.markSyncFailed(c.clientUuid, e.message ?: "Sin conexión")
            return PushResult(synced, null, "Sin conexión al subir colaboradores")
        }
    }

    /**
     * Bajar colaboradores del servidor y fundirlos con el cache local.
     * Los locales sin sincronizar no se tocan.
     */
    suspend fun pullFromServer(): Boolean {
        return try {
            val api = RetrofitClient.getApiService(context)
            val response = api.getCollaborators()
            if (!response.isSuccessful) return false
            val remote = response.body()?.result?.data?.json ?: return false

            for (r in remote) {
                val local = dao.getByServerId(r.id)
                if (local == null) {
                    dao.insert(
                        CollaboratorEntity(
                            clientUuid = UUID.randomUUID().toString(),
                            serverId = r.id,
                            name = r.name,
                            role = r.role,
                            phone = r.phone,
                            isSynced = true,
                        )
                    )
                } else if (local.isSynced) {
                    dao.update(local.copy(name = r.name, role = r.role, phone = r.phone))
                }
            }

            // Los puestos en uso también alimentan el selector
            CatalogPreferences.setRolesFromServer(context, remote.mapNotNull { it.role })

            // Quitar a los dados de baja en la web. La respuesta llegó bien
            // (isSuccessful + cuerpo válido), así que una lista vacía significa
            // de verdad "ya no queda nadie activo": también hay que reflejarlo.
            // Solo se borran los ya sincronizados; lo pendiente de subir no se toca.
            val activeIds = remote.map { it.id }
            if (activeIds.isEmpty()) dao.deleteAllSynced() else dao.deleteSyncedNotIn(activeIds)

            Log.i(TAG, "Colaboradores sincronizados: ${remote.size}")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error bajando colaboradores", e)
            false
        }
    }
}
