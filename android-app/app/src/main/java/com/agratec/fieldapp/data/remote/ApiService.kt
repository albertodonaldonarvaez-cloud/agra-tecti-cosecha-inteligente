package com.agratec.fieldapp.data.remote

import com.agratec.fieldapp.data.remote.dto.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

/**
 * Servicio de API que combina:
 * 1. Endpoints tRPC (mutations via POST con body JSON)
 * 2. Endpoint REST clásico para subida de fotos (multipart)
 *
 * tRPC usa la convención:
 * POST /api/trpc/{router}.{procedure}
 * Body: { "json": { ...input } }
 *
 * El interceptor de auth agrega automáticamente el header Authorization: Bearer.
 */
interface ApiService {

    // ============================================
    // AUTH
    // ============================================

    /**
     * Login para app móvil — retorna token JWT en el body.
     * Endpoint tRPC: auth.loginMobile
     */
    @POST("api/trpc/auth.loginMobile")
    suspend fun loginMobile(
        @Body body: TrpcMutationRequest<LoginRequest>
    ): Response<TrpcResponse<LoginResponseData>>

    // ============================================
    // OFFLINE SYNC — NOTAS DE CAMPO
    // ============================================

    /**
     * Enviar batch de notas de campo al servidor.
     * El servidor usa upsert (INSERT ... ON DUPLICATE KEY UPDATE) con el folio como clave.
     */
    @POST("api/trpc/offlineSync.syncFieldNotes")
    suspend fun syncFieldNotes(
        @Body body: TrpcMutationRequest<SyncNotesRequest>
    ): Response<TrpcResponse<SyncNotesResponseData>>

    // ============================================
    // OFFLINE SYNC — FOTOS
    // ============================================

    /**
     * Subir una foto asociada a una nota de campo.
     * Usa multipart/form-data (endpoint REST clásico, no tRPC).
     */
    @Multipart
    @POST("api/sync/photo")
    suspend fun uploadPhoto(
        @Part photo: MultipartBody.Part,
        @Part("fieldNoteFolio") fieldNoteFolio: RequestBody,
        @Part("localPhotoId") localPhotoId: RequestBody,
    ): Response<PhotoUploadResponse>

    // ============================================
    // OFFLINE SYNC — LIBRETA DE CAMPO (ACTIVIDADES)
    // ============================================

    /**
     * Enviar batch de actividades de la libreta de campo al servidor.
     * Upsert idempotente por clientUuid (con fallback a serverId para
     * actividades creadas en la web).
     */
    @POST("api/trpc/offlineSync.syncFieldActivities")
    suspend fun syncFieldActivities(
        @Body body: TrpcMutationRequest<SyncActivitiesRequest>
    ): Response<TrpcResponse<SyncActivitiesResponseData>>

    /**
     * Descargar actividades del servidor (incluye las planificadas en la web).
     * Es un tRPC query: GET con el input JSON en el parámetro "input",
     * con el formato superjson { "json": { ... } }.
     */
    @GET("api/trpc/offlineSync.getActivities")
    suspend fun getActivities(
        @Query("input") inputJson: String
    ): Response<TrpcResponse<List<ActivityData>>>

    // ============================================
    // DATOS DE REFERENCIA (para selector offline)
    // ============================================

    /**
     * Obtener lista de parcelas activas.
     * REST endpoint (no tRPC) — retorna { success, parcels: [...] }
     */
    @GET("api/mobile/parcels")
    suspend fun getParcels(): Response<ParcelsResponse>
}
