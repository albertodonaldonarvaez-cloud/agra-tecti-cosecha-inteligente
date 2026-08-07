package com.agratec.fieldapp.data.repository

import android.content.Context
import android.util.Log
import com.agratec.fieldapp.data.local.AppDatabase
import com.agratec.fieldapp.data.local.entity.CollaboratorEntity
import com.agratec.fieldapp.data.remote.RetrofitClient
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

    /** Alta local de un colaborador (se sube en el siguiente sync) */
    suspend fun addCollaborator(name: String, role: String?): CollaboratorEntity {
        val entity = CollaboratorEntity(
            clientUuid = UUID.randomUUID().toString(),
            name = name.trim(),
            role = role?.trim()?.takeIf { it.isNotBlank() },
            isSynced = false,
        )
        dao.insert(entity)
        Log.i(TAG, "Colaborador creado localmente: ${entity.name}")
        return entity
    }

    /** Subir colaboradores pendientes al servidor */
    suspend fun pushUnsynced(): Int {
        val unsynced = dao.getUnsynced()
        if (unsynced.isEmpty()) return 0
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
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error subiendo colaboradores", e)
        }
        return synced
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
                            isSynced = true,
                        )
                    )
                } else if (local.isSynced) {
                    dao.update(local.copy(name = r.name, role = r.role))
                }
            }

            // Quitar del selector a los dados de baja/desactivados en la web
            // (solo los ya sincronizados; los pendientes locales no se tocan)
            val activeIds = remote.map { it.id }
            if (activeIds.isNotEmpty()) {
                dao.deleteSyncedNotIn(activeIds)
            }

            Log.i(TAG, "Colaboradores sincronizados: ${remote.size}")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error bajando colaboradores", e)
            false
        }
    }
}
