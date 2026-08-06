package com.agratec.fieldapp.data.remote.dto

/**
 * Request body para offlineSync.syncFieldActivities via tRPC.
 * El servidor hace upsert idempotente usando clientUuid como clave;
 * si la actividad fue creada en la web (sin clientUuid) se envía serverId
 * para que el servidor la actualice y adopte el UUID.
 */
data class SyncActivitiesRequest(
    val activities: List<SyncActivityItem>,
)

data class SyncActivityItem(
    val clientUuid: String,
    val serverId: Int? = null,
    val activityType: String,
    val activitySubtype: String? = null,
    val description: String,
    val performedBy: String? = null,
    val activityDate: String, // "YYYY-MM-DD"
    val status: String = "planificada",
    val parcelIds: List<Int>? = null,
)

/** Respuesta de sincronización de actividades */
data class SyncActivitiesResponseData(
    val success: Boolean,
    val results: List<SyncActivityResult>?,
    val syncedCount: Int?,
)

data class SyncActivityResult(
    val clientUuid: String,
    val serverId: Int?,
    val status: String, // "created", "updated", "error"
    val error: String?,
)

/**
 * Actividad tal como la devuelve offlineSync.getActivities
 * (lista ligera para la app, incluye las planificadas desde la web).
 */
data class ActivityData(
    val id: Int,
    val clientUuid: String?,
    val activityType: String,
    val activitySubtype: String?,
    val description: String?,
    val performedBy: String?,
    val activityDate: String,
    val status: String,
    val parcelIds: List<Int>?,
)
