package com.agratec.fieldapp.data.remote.dto

import com.google.gson.annotations.SerializedName

/**
 * Respuesta del endpoint tRPC auth.loginMobile.
 * tRPC envuelve el resultado en { "result": { "data": { "json": ... } } }
 */
data class TrpcResponse<T>(
    val result: TrpcResult<T>?,
)

data class TrpcResult<T>(
    val data: TrpcData<T>?,
)

data class TrpcData<T>(
    val json: T?,
)

/** Datos de login retornados por el servidor */
data class LoginResponseData(
    val success: Boolean,
    val token: String?,
    val user: UserData?,
)

data class UserData(
    val id: Int,
    val email: String,
    val name: String,
    val role: String,
)

/** Respuesta de sincronización de notas */
data class SyncNotesResponseData(
    val success: Boolean,
    val results: List<SyncNoteResult>?,
    val syncedCount: Int?,
)

data class SyncNoteResult(
    val folio: String,
    val status: String, // "created", "updated", "error"
    val error: String?,
)

/** Respuesta genérica de subida de foto */
data class PhotoUploadResponse(
    val success: Boolean,
    val photoUrl: String?,
    val fieldNoteFolio: String?,
    val localPhotoId: String?,
    val error: String?,
)

/** Datos de una parcela (para selector offline) */
data class ParcelData(
    val id: Int,
    val code: String,
    val name: String,
)
