package com.agratec.fieldapp.data.remote

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.agratec.fieldapp.BuildConfig
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Singleton de Retrofit configurado con:
 * - Interceptor de autenticación (Bearer token)
 * - Logging en modo debug
 * - Timeouts generosos para conexiones lentas en campo
 * - Token almacenado de forma segura en EncryptedSharedPreferences
 */
object RetrofitClient {

    private const val TAG = "RetrofitClient"
    private const val PREFS_NAME = "agra_secure_prefs"
    private const val KEY_AUTH_TOKEN = "auth_token"

    @Volatile
    private var apiService: ApiService? = null

    @Volatile
    private var currentBaseUrl: String = BuildConfig.BASE_URL

    /**
     * Obtener la instancia del servicio API.
     * La primera vez se crea el cliente con todas las configuraciones.
     */
    fun getApiService(context: Context): ApiService {
        return apiService ?: synchronized(this) {
            apiService ?: createApiService(context).also { apiService = it }
        }
    }

    private fun createApiService(context: Context): ApiService {
        val baseUrl = currentBaseUrl.let {
            if (it.endsWith("/")) it else "$it/"
        }

        val client = OkHttpClient.Builder()
            // Interceptor de autenticación: agrega Bearer token a cada request
            .addInterceptor(createAuthInterceptor(context))
            // Logging solo en debug
            .apply {
                if (BuildConfig.DEBUG) {
                    val logging = HttpLoggingInterceptor { message ->
                        Log.d(TAG, message)
                    }
                    logging.level = HttpLoggingInterceptor.Level.BODY
                    addInterceptor(logging)
                }
            }
            // Timeouts generosos para zonas con señal débil
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }

    /**
     * Interceptor que agrega el header Authorization: Bearer {token}
     * a todas las peticiones excepto login.
     */
    private fun createAuthInterceptor(context: Context): Interceptor {
        return Interceptor { chain ->
            val request = chain.request()

            // No agregar token a endpoints de login
            if (request.url.encodedPath.contains("loginMobile")) {
                return@Interceptor chain.proceed(request)
            }

            val token = getToken(context)
            if (token != null) {
                val authenticatedRequest = request.newBuilder()
                    .addHeader("Authorization", "Bearer $token")
                    .build()
                chain.proceed(authenticatedRequest)
            } else {
                chain.proceed(request)
            }
        }
    }

    // ============================================
    // TOKEN MANAGEMENT (EncryptedSharedPreferences)
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

    /** Guardar token JWT de forma segura */
    fun saveToken(context: Context, token: String) {
        getEncryptedPrefs(context).edit().putString(KEY_AUTH_TOKEN, token).apply()
    }

    /** Obtener token JWT almacenado */
    fun getToken(context: Context): String? {
        return getEncryptedPrefs(context).getString(KEY_AUTH_TOKEN, null)
    }

    /** Limpiar token (logout) */
    fun clearToken(context: Context) {
        getEncryptedPrefs(context).edit().remove(KEY_AUTH_TOKEN).apply()
    }

    /** Verificar si hay sesión activa */
    fun isLoggedIn(context: Context): Boolean {
        return getToken(context) != null
    }

    /**
     * Forzar recreación del cliente (útil si cambia la URL base).
     */
    fun resetClient() {
        synchronized(this) {
            apiService = null
        }
    }
}
