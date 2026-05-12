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
    val parcelId: Int? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val createdAtLocal: String? = null,
)
