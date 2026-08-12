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
    val startTime: String? = null, // "HH:MM"
    val endTime: String? = null,
    val status: String = "planificada",
    val parcelIds: List<Int>? = null,
    val collaboratorIds: List<Int>? = null,
    val workSessions: List<WorkSessionDto>? = null,
    val products: List<ActivityProductDto>? = null,
)

/** Jornada de trabajo: un día con sus horas */
data class WorkSessionDto(
    val workDate: String,
    val startTime: String? = null,
    val endTime: String? = null,
)

/** Producto del almacén consumido en la actividad */
data class ActivityProductDto(
    /** Id en el almacén del servidor (null si el producto se escribió a mano) */
    val productId: Int? = null,
    val productName: String,
    val unit: String? = null,
    val plannedQuantity: String? = null,
    val usedQuantity: String? = null,
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
    val status: String, // "created", "updated", "deleted", "error"
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
    val startTime: String?,
    val endTime: String?,
    val status: String,
    val parcelIds: List<Int>?,
    val collaboratorIds: List<Int>?,
    val workSessions: List<WorkSessionDto>?,
    val products: List<ActivityProductDto>?,
)

// ============ COLABORADORES ============

data class SyncCollaboratorsRequest(
    val collaborators: List<SyncCollaboratorItem>,
)

data class SyncCollaboratorItem(
    val clientUuid: String,
    val name: String,
    val phone: String? = null,
    val role: String? = null,
)

data class SyncCollaboratorsResponseData(
    val success: Boolean,
    val results: List<SyncCollaboratorResult>?,
    val syncedCount: Int?,
)

data class SyncCollaboratorResult(
    val clientUuid: String,
    val serverId: Int?,
    val status: String,
    val error: String?,
)

/** Colaborador del servidor (offlineSync.getCollaborators) */
data class CollaboratorData(
    val id: Int,
    val name: String,
    val role: String?,
    val phone: String? = null,
)

/** Puesto del catálogo (offlineSync.getCollaboratorRoles) */
data class CollaboratorRoleData(
    val id: Int,
    val name: String,
)

// ============ ALMACÉN ============

data class SyncProductsRequest(
    val products: List<SyncProductItem>,
)

data class SyncProductItem(
    val clientUuid: String,
    /** ID del servidor cuando el producto se creó en la web y se edita desde el campo */
    val serverId: Int? = null,
    val name: String,
    val brand: String? = null,
    val category: String? = null,
    val unit: String? = null,
    val description: String? = null,
    val activeIngredient: String? = null,
    val concentration: String? = null,
    val presentation: String? = null,
    val storageLocation: String? = null,
)

data class SyncProductsResponseData(
    val success: Boolean,
    val results: List<SyncProductResult>?,
    val syncedCount: Int?,
)

data class SyncProductResult(
    val clientUuid: String,
    val serverId: Int?,
    val status: String,
    val error: String?,
)

/** Producto del almacén (offlineSync.getProducts) */
data class ProductData(
    val id: Int,
    val clientUuid: String?,
    val name: String,
    val brand: String?,
    val category: String?,
    val unit: String?,
    val presentation: String?,
    val description: String?,
    val activeIngredient: String?,
    val concentration: String?,
    val storageLocation: String?,
    val photoUrl: String?,
)

// ============ BITÁCORA DE LA APP ============

/** Lote de eventos de la app para offlineSync.syncAppLogs */
data class SyncAppLogsRequest(
    val device: String?,
    val appVersion: String?,
    val logs: List<AppLogItem>,
)

data class AppLogItem(
    val clientLogId: String,
    val action: String,
    val screen: String? = null,
    val detail: String? = null,
    val originalBytes: Long? = null,
    val finalBytes: Long? = null,
    val durationSeconds: Int? = null,
    val occurredAt: String,
)

data class SyncAppLogsResponseData(
    val success: Boolean,
    /** IDs que el servidor ya guardó: se borran del teléfono */
    val storedIds: List<String>?,
    val storedCount: Int?,
)

// ============ AUTO-ACTUALIZACIÓN ============

/** Respuesta de GET /api/mobile/app-version */
data class AppVersionResponse(
    val success: Boolean,
    val available: Boolean?,
    val versionCode: Int?,
    val versionName: String?,
    val notes: String?,
    val fileSize: Long?,
    val downloadUrl: String?,
)
