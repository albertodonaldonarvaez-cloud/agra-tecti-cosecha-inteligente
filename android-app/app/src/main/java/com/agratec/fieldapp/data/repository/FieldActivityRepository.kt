package com.agratec.fieldapp.data.repository

import android.content.Context
import android.util.Log
import com.agratec.fieldapp.data.local.AppDatabase
import com.agratec.fieldapp.data.local.entity.ActivityPhotoEntity
import com.agratec.fieldapp.data.local.entity.FieldActivityEntity
import com.agratec.fieldapp.data.local.entity.WorkSession
import com.agratec.fieldapp.data.remote.RetrofitClient
import com.agratec.fieldapp.sync.SyncWorker
import kotlinx.coroutines.flow.Flow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * Repositorio de actividades de la libreta de campo (offline-first).
 *
 * - Crear/completar actividades escribe primero en Room (isSynced = false)
 *   y dispara una sincronización inmediata si hay red.
 * - [pullFromServer] baja las actividades del servidor (incluidas las
 *   planificadas desde la web) y las funde con las locales; los cambios
 *   locales pendientes de subir nunca se pisan.
 */
class FieldActivityRepository(private val context: Context) {

    companion object {
        private const val TAG = "FieldActivityRepo"
    }

    private val db = AppDatabase.getInstance(context)
    private val dao = db.fieldActivityDao()

    fun getAll(): Flow<List<FieldActivityEntity>> = dao.getAll()

    suspend fun getUnsyncedCount(): Int = dao.getUnsyncedCount()

    /** Crear una actividad localmente y programar sync inmediato */
    suspend fun createActivity(
        activityType: String,
        activitySubtype: String?,
        description: String,
        performedBy: String,
        activityDate: String,
        status: String,
        parcelIds: List<Int>,
        startTime: String? = null,
        endTime: String? = null,
        workSessions: List<WorkSession> = emptyList(),
        collaboratorUuids: List<String> = emptyList(),
        photoFilePaths: List<String> = emptyList(),
    ): FieldActivityEntity {
        val nowIso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(Date())
        val entity = FieldActivityEntity(
            clientUuid = UUID.randomUUID().toString(),
            activityType = activityType,
            activitySubtype = activitySubtype?.takeIf { it.isNotBlank() },
            description = description,
            performedBy = performedBy,
            activityDate = activityDate,
            startTime = startTime?.takeIf { it.isNotBlank() },
            endTime = endTime?.takeIf { it.isNotBlank() },
            workSessionsJson = FieldActivityEntity.encodeSessions(workSessions),
            status = status,
            parcelIdsCsv = parcelIds.joinToString(","),
            collaboratorUuidsCsv = collaboratorUuids.joinToString(","),
            isSynced = false,
            createdAtLocal = nowIso,
        )
        dao.insert(entity)

        // Registrar las fotos tomadas (se suben cuando la actividad sincronice)
        for (path in photoFilePaths) {
            db.activityPhotoDao().insert(
                ActivityPhotoEntity(
                    localPhotoId = UUID.randomUUID().toString(),
                    activityClientUuid = entity.clientUuid,
                    localFilePath = path,
                    createdAtLocal = nowIso,
                )
            )
        }

        Log.i(TAG, "Actividad creada localmente: ${entity.clientUuid} ($activityType, ${photoFilePaths.size} fotos)")
        SyncWorker.enqueueImmediateSync(context)
        return entity
    }

    /** Agregar una foto a una actividad existente (p. ej. al completarla) */
    suspend fun addPhoto(activityClientUuid: String, filePath: String, photoType: String = "durante") {
        val nowIso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(Date())
        db.activityPhotoDao().insert(
            ActivityPhotoEntity(
                localPhotoId = UUID.randomUUID().toString(),
                activityClientUuid = activityClientUuid,
                localFilePath = filePath,
                photoType = photoType,
                createdAtLocal = nowIso,
            )
        )
        SyncWorker.enqueueImmediateSync(context)
    }

    suspend fun photoCount(activityClientUuid: String): Int =
        db.activityPhotoDao().countForActivity(activityClientUuid)

    /** Dar otra oportunidad a todo lo rechazado (lo dispara el sync manual) */
    suspend fun resetFailedSyncAttempts() {
        dao.resetFailedAttempts()
        db.activityPhotoDao().resetFailedAttempts()
        db.collaboratorDao().resetFailedAttempts()
    }

    /** Cambiar el estado de una actividad (p. ej. marcarla completada) */
    suspend fun setStatus(clientUuid: String, status: String) {
        dao.updateStatus(clientUuid, status)
        Log.i(TAG, "Actividad $clientUuid -> $status (pendiente de sync)")
        SyncWorker.enqueueImmediateSync(context)
    }

    /**
     * Bajar actividades del servidor y fundirlas con las locales.
     * Regla: si la actividad local tiene cambios sin subir (isSynced = false)
     * NO se toca; la versión local gana hasta que se sincronice.
     *
     * @return true si la descarga fue exitosa
     */
    suspend fun pullFromServer(): Boolean {
        return try {
            val apiService = RetrofitClient.getApiService(context)
            // Formato superjson de tRPC para queries: ?input={"json":{...}}
            val response = apiService.getActivities("""{"json":{"limit":500}}""")
            if (!response.isSuccessful) {
                Log.w(TAG, "Error HTTP al bajar actividades: ${response.code()}")
                return false
            }
            val activities = response.body()?.result?.data?.json ?: emptyList()
            var created = 0
            var updated = 0

            // Resolver colaboradores del servidor → UUIDs locales del cache
            val collabDao = db.collaboratorDao()
            val resolveCollabUuids: suspend (List<Int>?) -> String = { serverIds ->
                (serverIds ?: emptyList())
                    .mapNotNull { sid -> collabDao.getByServerId(sid)?.clientUuid }
                    .joinToString(",")
            }

            for (remote in activities) {
                val local = dao.getByServerId(remote.id)
                    ?: remote.clientUuid?.let { dao.getByUuid(it) }

                val sessionsJson = FieldActivityEntity.encodeSessions(
                    (remote.workSessions ?: emptyList()).map {
                        WorkSession(it.workDate.take(10), it.startTime, it.endTime)
                    }
                )

                if (local == null) {
                    // Actividad nueva (normalmente creada desde la web)
                    val nowIso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(Date())
                    dao.insert(
                        FieldActivityEntity(
                            clientUuid = remote.clientUuid ?: UUID.randomUUID().toString(),
                            serverId = remote.id,
                            activityType = remote.activityType,
                            activitySubtype = remote.activitySubtype,
                            description = remote.description ?: "",
                            performedBy = remote.performedBy ?: "",
                            activityDate = remote.activityDate.take(10),
                            startTime = remote.startTime,
                            endTime = remote.endTime,
                            workSessionsJson = sessionsJson,
                            status = remote.status,
                            parcelIdsCsv = (remote.parcelIds ?: emptyList()).joinToString(","),
                            collaboratorUuidsCsv = resolveCollabUuids(remote.collaboratorIds),
                            isSynced = true,
                            createdAtLocal = nowIso,
                        )
                    )
                    created++
                } else if (local.isSynced) {
                    // Sin cambios locales pendientes: adoptar la versión del servidor
                    dao.update(
                        local.copy(
                            serverId = remote.id,
                            activityType = remote.activityType,
                            activitySubtype = remote.activitySubtype,
                            description = remote.description ?: local.description,
                            performedBy = remote.performedBy ?: local.performedBy,
                            activityDate = remote.activityDate.take(10),
                            startTime = remote.startTime,
                            endTime = remote.endTime,
                            workSessionsJson = sessionsJson,
                            status = remote.status,
                            parcelIdsCsv = (remote.parcelIds ?: emptyList()).joinToString(","),
                            collaboratorUuidsCsv = resolveCollabUuids(remote.collaboratorIds),
                        )
                    )
                    updated++
                }
                // local con isSynced = false → cambios locales pendientes, no tocar
            }

            Log.i(TAG, "Pull de actividades: $created nuevas, $updated actualizadas")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error bajando actividades", e)
            false
        }
    }
}
