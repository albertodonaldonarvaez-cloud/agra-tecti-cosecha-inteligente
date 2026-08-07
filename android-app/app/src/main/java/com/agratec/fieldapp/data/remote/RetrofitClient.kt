package com.agratec.fieldapp.data.remote

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.agratec.fieldapp.BuildConfig
import com.agratec.fieldapp.data.remote.dto.RefreshRequest
import com.agratec.fieldapp.data.remote.dto.TrpcMutationRequest
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Singleton de Retrofit configurado con:
 * - Interceptor de autenticación (Bearer token)
 * - **Renovación automática de sesión**: si el servidor responde 401, canjea el
 *   token de refresco por uno nuevo y reintenta la petición. Si el refresco ya
 *   no sirve, cierra la sesión para que la app mande al login (antes se quedaba
 *   "logueada" pero sin poder sincronizar nada).
 * - Logging en modo debug
 * - Timeouts generosos para conexiones lentas en campo
 * - Tokens guardados en EncryptedSharedPreferences
 */
object RetrofitClient {

    private const val TAG = "RetrofitClient"
    private const val PREFS_NAME = "agra_secure_prefs"
    private const val KEY_AUTH_TOKEN = "auth_token"
    private const val KEY_REFRESH_TOKEN = "refresh_token"
    private const val KEY_SESSION_EXPIRED = "session_expired"

    @Volatile
    private var apiService: ApiService? = null

    @Volatile
    private var currentBaseUrl: String = BuildConfig.BASE_URL

    fun getApiService(context: Context): ApiService {
        return apiService ?: synchronized(this) {
            apiService ?: createApiService(context).also { apiService = it }
        }
    }

    private fun baseUrlWithSlash(): String =
        currentBaseUrl.let { if (it.endsWith("/")) it else "$it/" }

    private fun createApiService(context: Context): ApiService {
        val client = OkHttpClient.Builder()
            .addInterceptor(createAuthInterceptor(context))
            .authenticator(createTokenAuthenticator(context))
            .apply {
                if (BuildConfig.DEBUG) {
                    val logging = HttpLoggingInterceptor { message -> Log.d(TAG, message) }
                    logging.level = HttpLoggingInterceptor.Level.BODY
                    addInterceptor(logging)
                }
            }
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrlWithSlash())
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }

    /** Cliente mínimo (sin interceptores de auth) para renovar el token */
    private fun createRefreshService(): ApiService =
        Retrofit.Builder()
            .baseUrl(baseUrlWithSlash())
            .client(
                OkHttpClient.Builder()
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .build()
            )
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)

    /** Agrega Authorization: Bearer {token} salvo en login/refresh */
    private fun createAuthInterceptor(context: Context): Interceptor {
        return Interceptor { chain ->
            val request = chain.request()
            val path = request.url.encodedPath
            if (path.contains("loginMobile") || path.contains("refreshMobile")) {
                return@Interceptor chain.proceed(request)
            }
            val token = getToken(context)
            if (token != null) {
                chain.proceed(
                    request.newBuilder().addHeader("Authorization", "Bearer $token").build()
                )
            } else {
                chain.proceed(request)
            }
        }
    }

    /**
     * Se dispara SOLO cuando el servidor responde 401.
     * Renueva la sesión una vez y reintenta; si no puede, cierra sesión.
     */
    private fun createTokenAuthenticator(context: Context): Authenticator {
        return object : Authenticator {
            override fun authenticate(route: Route?, response: Response): Request? {
                // Evitar bucles: si ya reintentamos esta petición, rendirse
                if (responseCount(response) >= 2) {
                    markSessionExpired(context)
                    return null
                }
                val path = response.request.url.encodedPath
                if (path.contains("loginMobile") || path.contains("refreshMobile")) return null

                synchronized(this) {
                    val tokenAtFailure = response.request.header("Authorization")?.removePrefix("Bearer ")
                    val currentToken = getToken(context)

                    // Otro hilo ya lo renovó mientras esperábamos: reintentar con el nuevo
                    if (currentToken != null && currentToken != tokenAtFailure) {
                        return response.request.newBuilder()
                            .header("Authorization", "Bearer $currentToken")
                            .build()
                    }

                    val refresh = getRefreshToken(context)
                    if (refresh.isNullOrBlank()) {
                        Log.w(TAG, "401 y sin token de refresco: se requiere login")
                        markSessionExpired(context)
                        return null
                    }

                    return try {
                        val refreshResponse = createRefreshService()
                            .refreshMobileSync(TrpcMutationRequest(RefreshRequest(refresh)))
                            .execute()
                        val data = refreshResponse.body()?.result?.data?.json
                        val newToken = data?.token
                        if (refreshResponse.isSuccessful && !newToken.isNullOrBlank()) {
                            saveToken(context, newToken)
                            data.refreshToken?.let { saveRefreshToken(context, it) }
                            clearSessionExpired(context)
                            Log.i(TAG, "Sesión renovada automáticamente")
                            response.request.newBuilder()
                                .header("Authorization", "Bearer $newToken")
                                .build()
                        } else {
                            Log.w(TAG, "No se pudo renovar la sesión (${refreshResponse.code()}): se requiere login")
                            markSessionExpired(context)
                            null
                        }
                    } catch (e: Exception) {
                        // Sin conexión: NO cerramos sesión, se reintentará después
                        Log.w(TAG, "Error de red al renovar sesión, se reintentará", e)
                        null
                    }
                }
            }
        }
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }

    // ============================================
    // TOKENS (EncryptedSharedPreferences)
    // ============================================

    private fun getEncryptedPrefs(context: Context) = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        Log.e(TAG, "Error creating encrypted prefs, falling back to regular prefs", e)
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun saveToken(context: Context, token: String) {
        getEncryptedPrefs(context).edit().putString(KEY_AUTH_TOKEN, token).apply()
    }

    fun getToken(context: Context): String? =
        getEncryptedPrefs(context).getString(KEY_AUTH_TOKEN, null)

    fun saveRefreshToken(context: Context, token: String) {
        getEncryptedPrefs(context).edit().putString(KEY_REFRESH_TOKEN, token).apply()
    }

    fun getRefreshToken(context: Context): String? =
        getEncryptedPrefs(context).getString(KEY_REFRESH_TOKEN, null)

    /** Limpiar sesión (logout) */
    fun clearToken(context: Context) {
        getEncryptedPrefs(context).edit()
            .remove(KEY_AUTH_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_SESSION_EXPIRED)
            .apply()
    }

    fun isLoggedIn(context: Context): Boolean = getToken(context) != null

    // ── Sesión expirada: la app lo consulta para mandar al login ──

    private fun markSessionExpired(context: Context) {
        getEncryptedPrefs(context).edit()
            .putBoolean(KEY_SESSION_EXPIRED, true)
            .remove(KEY_AUTH_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .apply()
    }

    private fun clearSessionExpired(context: Context) {
        getEncryptedPrefs(context).edit().putBoolean(KEY_SESSION_EXPIRED, false).apply()
    }

    /** true si hubo que cerrar sesión porque ya no se pudo renovar */
    fun isSessionExpired(context: Context): Boolean =
        getEncryptedPrefs(context).getBoolean(KEY_SESSION_EXPIRED, false)

    fun consumeSessionExpired(context: Context) {
        getEncryptedPrefs(context).edit().putBoolean(KEY_SESSION_EXPIRED, false).apply()
    }

    fun resetClient() {
        synchronized(this) { apiService = null }
    }
}
