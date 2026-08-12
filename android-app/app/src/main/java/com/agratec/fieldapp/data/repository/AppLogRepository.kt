package com.agratec.fieldapp.data.repository

import android.content.Context
import android.util.Log
import com.agratec.fieldapp.BuildConfig
import com.agratec.fieldapp.data.local.AppDatabase
import com.agratec.fieldapp.data.remote.RetrofitClient
import com.agratec.fieldapp.data.remote.dto.AppLogItem
import com.agratec.fieldapp.data.remote.dto.SyncAppLogsRequest
import com.agratec.fieldapp.data.remote.dto.TrpcMutationRequest
import com.agratec.fieldapp.util.AppLogger

/**
 * Sube la bitácora de la app al servidor.
 *
 * Va por lotes y solo borra del teléfono los eventos que el servidor confirmó
 * haber guardado: si el lote se corta a la mitad, lo que quedó fuera se
 * reintenta en la siguiente sincronización sin duplicarse (clientLogId).
 */
class AppLogRepository(private val context: Context) {

    companion object {
        private const val TAG = "AppLogRepo"

        /** Eventos por lote. Pesan poco (texto), pero no conviene mandar miles de golpe */
        private const val BATCH = 200
    }

    private val dao = AppDatabase.getInstance(context).appLogDao()

    suspend fun getPendingCount(): Int = dao.getUnsyncedCount()

    /** @return cuántos eventos quedaron registrados en el servidor */
    suspend fun push(): Int {
        val pendientes = dao.getUnsynced(BATCH)
        if (pendientes.isEmpty()) return 0

        return try {
            val api = RetrofitClient.getApiService(context)
            val response = api.syncAppLogs(
                TrpcMutationRequest(
                    SyncAppLogsRequest(
                        device = AppLogger.deviceName(),
                        appVersion = BuildConfig.VERSION_NAME,
                        logs = pendientes.map {
                            AppLogItem(
                                clientLogId = it.clientLogId,
                                action = it.action,
                                screen = it.screen,
                                detail = it.detail,
                                originalBytes = it.originalBytes,
                                finalBytes = it.finalBytes,
                                durationSeconds = it.durationSeconds,
                                occurredAt = it.occurredAt,
                            )
                        },
                    )
                )
            )

            if (!response.isSuccessful) {
                // Un servidor viejo (404) o una sesión caída no deben dejar la
                // bitácora reintentando para siempre: se cuenta el intento
                dao.markFailed(pendientes.map { it.clientLogId })
                Log.w(TAG, "No se pudo subir la bitácora: HTTP ${response.code()}")
                return 0
            }

            val guardados = response.body()?.result?.data?.json?.storedIds.orEmpty()
            if (guardados.isNotEmpty()) {
                // En trozos: SQLite no acepta miles de parámetros en un IN (...)
                guardados.chunked(200).forEach { dao.deleteByIds(it) }
            }
            val rechazados = pendientes.map { it.clientLogId } - guardados.toSet()
            if (rechazados.isNotEmpty()) dao.markFailed(rechazados)

            Log.i(TAG, "Bitácora subida: ${guardados.size} evento(s)")
            guardados.size
        } catch (e: Exception) {
            Log.w(TAG, "Error subiendo la bitácora", e)
            dao.markFailed(pendientes.map { it.clientLogId })
            0
        }
    }
}
