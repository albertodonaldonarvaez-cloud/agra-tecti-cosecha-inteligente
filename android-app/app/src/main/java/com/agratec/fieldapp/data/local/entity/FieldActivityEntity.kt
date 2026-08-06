package com.agratec.fieldapp.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

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

    /** Estado: planificada, en_progreso, completada, cancelada */
    val status: String = "planificada",

    /** IDs de parcelas (servidor) separados por coma, ej: "3,7" */
    val parcelIdsCsv: String = "",

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
}
