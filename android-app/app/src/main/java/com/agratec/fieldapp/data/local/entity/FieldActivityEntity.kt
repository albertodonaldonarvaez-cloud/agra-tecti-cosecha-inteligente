package com.agratec.fieldapp.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import org.json.JSONArray
import org.json.JSONObject

/**
 * Entidad Room para actividades de la libreta de campo.
 * El campo [clientUuid] es un UUID generado en el dispositivo que sirve como
 * clave de idempotencia al sincronizar con el servidor
 * (offlineSync.syncFieldActivities).
 *
 * Las actividades creadas desde la web llegan por el pull de sincronización
 * con [serverId] asignado; se les genera un UUID local para poder editarlas
 * (p. ej. marcarlas como completadas) y sincronizar el cambio.
 */
@Entity(
    tableName = "field_activities",
    indices = [Index(value = ["clientUuid"], unique = true)]
)
data class FieldActivityEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    /** UUID v4 — clave de idempotencia con el servidor */
    val clientUuid: String,

    /** ID de la actividad en el servidor (null si aún no se sincroniza) */
    val serverId: Int? = null,

    /** Tipo: riego, fertilizacion, nutricion, poda, control_maleza, control_plagas, aplicacion_fitosanitaria, otro */
    val activityType: String,

    /** Subtipo libre (Ej: "Goteo", "Formación") */
    val activitySubtype: String? = null,

    /** Descripción de la actividad */
    val description: String,

    /** Quién la realizó / realizará */
    val performedBy: String,

    /** Fecha de la actividad "YYYY-MM-DD" */
    val activityDate: String,

    /** Hora de inicio "HH:MM" (día único) */
    val startTime: String? = null,

    /** Hora de fin "HH:MM" (día único) */
    val endTime: String? = null,

    /**
     * Jornadas de trabajo para actividades de varios días, como JSON:
     * [{"workDate":"2026-08-06","startTime":"07:00","endTime":"14:00"}, ...]
     */
    @ColumnInfo(defaultValue = "[]")
    val workSessionsJson: String = "[]",

    /** Estado: planificada, en_progreso, completada, cancelada */
    val status: String = "planificada",

    /** IDs de parcelas (servidor) separados por coma, ej: "3,7" */
    val parcelIdsCsv: String = "",

    /** UUIDs locales de colaboradores asignados, separados por coma */
    @ColumnInfo(defaultValue = "")
    val collaboratorUuidsCsv: String = "",

    /**
     * Productos del almacén consumidos, como JSON:
     * [{"productUuid":"…","serverId":4,"name":"Urea","unit":"kg","planned":"20","used":"18"}, …]
     */
    @ColumnInfo(defaultValue = "[]")
    val productsJson: String = "[]",

    /** Flag de sincronización: false = hay cambios locales pendientes de subir */
    val isSynced: Boolean = false,

    /** Número de intentos fallidos de sincronización */
    val syncAttempts: Int = 0,

    /** Último error de sincronización (para debugging) */
    val lastSyncError: String? = null,

    /** Timestamp local (ISO 8601) de cuando se creó localmente */
    val createdAtLocal: String,
) {
    /** IDs de parcela como lista de enteros */
    fun parcelIds(): List<Int> =
        parcelIdsCsv.split(",").mapNotNull { it.trim().toIntOrNull() }

    /** UUIDs de colaboradores como lista */
    fun collaboratorUuids(): List<String> =
        collaboratorUuidsCsv.split(",").map { it.trim() }.filter { it.isNotBlank() }

    /** Jornadas de trabajo decodificadas del JSON */
    fun workSessions(): List<WorkSession> = try {
        val arr = JSONArray(workSessionsJson)
        (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            WorkSession(
                workDate = o.optString("workDate", ""),
                startTime = o.optString("startTime", "").takeIf { it.isNotBlank() },
                endTime = o.optString("endTime", "").takeIf { it.isNotBlank() },
            )
        }.filter { it.workDate.isNotBlank() }
    } catch (e: Exception) {
        emptyList()
    }

    /** Productos consumidos decodificados del JSON */
    fun products(): List<ActivityProduct> = try {
        val arr = JSONArray(productsJson)
        (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            val name = o.optString("name", "")
            if (name.isBlank()) return@mapNotNull null
            ActivityProduct(
                productUuid = o.optString("productUuid", "").takeIf { it.isNotBlank() },
                serverId = o.optInt("serverId", -1).takeIf { it >= 0 },
                name = name,
                unit = o.optString("unit", "kg").ifBlank { "kg" },
                planned = o.optString("planned", "").takeIf { it.isNotBlank() },
                used = o.optString("used", "").takeIf { it.isNotBlank() },
            )
        }
    } catch (e: Exception) {
        emptyList()
    }

    companion object {
        fun encodeSessions(sessions: List<WorkSession>): String {
            val arr = JSONArray()
            for (s in sessions) {
                val o = JSONObject()
                o.put("workDate", s.workDate)
                if (!s.startTime.isNullOrBlank()) o.put("startTime", s.startTime)
                if (!s.endTime.isNullOrBlank()) o.put("endTime", s.endTime)
                arr.put(o)
            }
            return arr.toString()
        }

        fun encodeProducts(products: List<ActivityProduct>): String {
            val arr = JSONArray()
            for (p in products) {
                val o = JSONObject()
                o.put("name", p.name)
                o.put("unit", p.unit)
                if (!p.productUuid.isNullOrBlank()) o.put("productUuid", p.productUuid)
                if (p.serverId != null) o.put("serverId", p.serverId)
                if (!p.planned.isNullOrBlank()) o.put("planned", p.planned)
                if (!p.used.isNullOrBlank()) o.put("used", p.used)
                arr.put(o)
            }
            return arr.toString()
        }
    }
}

/** Una jornada de trabajo: día + horas */
data class WorkSession(
    val workDate: String,
    val startTime: String? = null,
    val endTime: String? = null,
)

/**
 * Producto del almacén consumido en una actividad.
 *
 * [productUuid] apunta al producto local (que puede estar aún sin subir);
 * [serverId] es su id en el almacén cuando ya sincronizó. La unidad se copia
 * del producto al seleccionarlo, para que quede registrada aunque después
 * cambie en el catálogo.
 */
data class ActivityProduct(
    val productUuid: String? = null,
    val serverId: Int? = null,
    val name: String,
    val unit: String = "kg",
    /** Cantidad planeada */
    val planned: String? = null,
    /** Cantidad realmente utilizada */
    val used: String? = null,
)
