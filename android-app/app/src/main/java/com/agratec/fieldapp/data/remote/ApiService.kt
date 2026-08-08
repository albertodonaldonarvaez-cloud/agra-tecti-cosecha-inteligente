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

    /**
     * Renovar la sesión con el token de refresco (sin pedir contraseña).
     * Se llama automáticamente cuando el token de acceso caduca.
     */
    @POST("api/trpc/auth.refreshMobile")
    suspend fun refreshMobile(
        @Body body: TrpcMutationRequest<RefreshRequest>
    ): Response<TrpcResponse<LoginResponseData>>

    /** Versión síncrona (la usa el Authenticator de OkHttp, que no es suspend) */
    @POST("api/trpc/auth.refreshMobile")
    fun refreshMobileSync(
        @Body body: TrpcMutationRequest<RefreshRequest>
    ): retrofit2.Call<TrpcResponse<LoginResponseData>>

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

    /**
     * Descargar las notas del servidor (incluidas las capturadas en la web o
     * por Telegram) junto con todos los folios vivos, para poder darles
     * seguimiento en el campo y borrar localmente lo que ya se eliminó.
     */
    @GET("api/trpc/offlineSync.getFieldNotes")
    suspend fun getFieldNotes(
        @Query("input") inputJson: String
    ): Response<TrpcResponse<FieldNotesResponseData>>

    /** Cambiar el estado de una nota desde el campo (darle seguimiento / cerrarla) */
    @POST("api/trpc/offlineSync.updateNoteStatus")
    suspend fun updateNoteStatus(
        @Body body: TrpcMutationRequest<UpdateNoteStatusRequest>
    ): Response<TrpcResponse<UpdateNoteStatusResponseData>>

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
    // OFFLINE SYNC — COLABORADORES DE CAMPO
    // ============================================

    /** Subir colaboradores dados de alta desde el teléfono (idempotente por clientUuid) */
    @POST("api/trpc/offlineSync.syncCollaborators")
    suspend fun syncCollaborators(
        @Body body: TrpcMutationRequest<SyncCollaboratorsRequest>
    ): Response<TrpcResponse<SyncCollaboratorsResponseData>>

    /** Descargar colaboradores activos del servidor (query sin input) */
    @GET("api/trpc/offlineSync.getCollaborators")
    suspend fun getCollaborators(): Response<TrpcResponse<List<CollaboratorData>>>

    /** Catálogo de puestos del servidor (para el selector, con opción "Otro") */
    @GET("api/trpc/offlineSync.getCollaboratorRoles")
    suspend fun getCollaboratorRoles(): Response<TrpcResponse<List<CollaboratorRoleData>>>

    // ============================================
    // OFFLINE SYNC — ALMACÉN DE PRODUCTOS
    // ============================================

    /** Subir productos dados de alta desde el teléfono (idempotente por clientUuid) */
    @POST("api/trpc/offlineSync.syncProducts")
    suspend fun syncProducts(
        @Body body: TrpcMutationRequest<SyncProductsRequest>
    ): Response<TrpcResponse<SyncProductsResponseData>>

    /** Descargar el catálogo de productos activos del almacén */
    @GET("api/trpc/offlineSync.getProducts")
    suspend fun getProducts(): Response<TrpcResponse<List<ProductData>>>

    // ============================================
    // FOTOS DE ACTIVIDADES (multipart)
    // ============================================

    /** Subir una foto de una actividad de la libreta (varios ángulos permitidos) */
    @Multipart
    @POST("api/sync/activity-photo")
    suspend fun uploadActivityPhoto(
        @Part photo: MultipartBody.Part,
        @Part("activityClientUuid") activityClientUuid: RequestBody,
        @Part("localPhotoId") localPhotoId: RequestBody,
        @Part("photoType") photoType: RequestBody,
    ): Response<PhotoUploadResponse>

    // ============================================
    // AUTO-ACTUALIZACIÓN
    // ============================================

    /** Última versión del APK publicada en el servidor (público) */
    @GET("api/mobile/app-version")
    suspend fun getAppVersion(): Response<AppVersionResponse>

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
