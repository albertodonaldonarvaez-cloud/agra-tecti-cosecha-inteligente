package com.agratec.fieldapp.data.remote.dto

/**
 * Request body para offlineSync.syncFieldNotes via tRPC.
 * El servidor espera un objeto con campo "notes" conteniendo un array.
 */
data class SyncNotesRequest(
    val notes: List<SyncNoteItem>,
)

data class SyncNoteItem(
    val folio: String,
    val description: String,
    val category: String,
    val severity: String = "media",
    /** Estado de seguimiento: la nota puede nacer o cerrarse en el campo */
    val status: String? = null,
    val resolutionNotes: String? = null,
    val parcelId: Int? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val createdAtLocal: String? = null,
)

// ============ SEGUIMIENTO DE NOTAS ============

/** Nota tal como la devuelve offlineSync.getFieldNotes */
data class FieldNoteData(
    val id: Int,
    val folio: String,
    val description: String?,
    val category: String?,
    val severity: String?,
    val status: String?,
    val parcelId: Int?,
    val resolutionNotes: String?,
    val createdAt: String?,
    val updatedAt: String?,
)

/** Respuesta de offlineSync.getFieldNotes: notas recientes + folios vivos */
data class FieldNotesResponseData(
    val notes: List<FieldNoteData>?,
    /** TODOS los folios que siguen existiendo: sirve para borrar lo eliminado en la web */
    val allFolios: List<String>?,
)

/** Cambio de estado de una nota hecho desde el campo */
data class UpdateNoteStatusRequest(
    val folio: String,
    val status: String,
    val resolutionNotes: String? = null,
)

data class UpdateNoteStatusResponseData(
    val success: Boolean,
    /** "updated" o "deleted" si la nota ya no existe en el servidor */
    val status: String?,
)
