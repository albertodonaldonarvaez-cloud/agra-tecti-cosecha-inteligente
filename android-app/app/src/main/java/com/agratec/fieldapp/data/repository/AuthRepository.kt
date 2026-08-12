package com.agratec.fieldapp.data.repository

import android.content.Context
import android.util.Log
import com.agratec.fieldapp.data.remote.RetrofitClient
import com.agratec.fieldapp.sync.SyncWorker
import com.agratec.fieldapp.util.AppLogger
import com.agratec.fieldapp.data.remote.dto.LoginRequest
import com.agratec.fieldapp.data.remote.dto.TrpcMutationRequest

/**
 * Repositorio de autenticación.
 * Maneja login, almacenamiento seguro del token, y estado de sesión.
 */
class AuthRepository(private val context: Context) {

    companion object {
        private const val TAG = "AuthRepository"
        private const val PREFS = "agra_prefs"
        private const val KEY_USER_NAME = "user_name"

        /** Nombre del usuario logueado (para prellenar "realizado por") */
        fun getUserName(context: Context): String =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_USER_NAME, "") ?: ""
    }

    private val apiService = RetrofitClient.getApiService(context)

    /**
     * Iniciar sesión con email y contraseña.
     * Si es exitoso, almacena el token JWT de forma segura.
     *
     * @return Resultado con datos del usuario o error descriptivo
     */
    suspend fun login(email: String, password: String): Result<LoginResult> {
        return try {
            val response = apiService.loginMobile(
                TrpcMutationRequest(LoginRequest(email, password))
            )

            if (response.isSuccessful) {
                val body = response.body()
                val data = body?.result?.data?.json

                if (data?.success == true && data.token != null) {
                    // Guardar token de forma segura
                    RetrofitClient.saveToken(context, data.token)
                    // Token de refresco: permite renovar la sesión sin volver a
                    // pedir contraseña cuando caduque el de acceso
                    data.refreshToken?.let { RetrofitClient.saveRefreshToken(context, it) }
                    RetrofitClient.consumeSessionExpired(context)
                    // Guardar nombre para prellenar "realizado por" en la libreta
                    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .edit().putString(KEY_USER_NAME, data.user?.name ?: "").apply()
                    Log.i(TAG, "Login exitoso para: ${data.user?.name}")
                    AppLogger.log(
                        context, AppLogger.LOGIN, "Inicio de sesión",
                        "Entró ${data.user?.name ?: email} desde ${AppLogger.deviceName()}",
                    )
                    // La bitácora que quedó pendiente (incluidos los intentos
                    // fallidos y el cierre de sesión anterior) sube en el
                    // siguiente sync, que este login dispara
                    SyncWorker.enqueueImmediateSync(context)
                    Result.success(
                        LoginResult(
                            userName = data.user?.name ?: "Usuario",
                            userEmail = data.user?.email ?: email,
                            userRole = data.user?.role ?: "user",
                        )
                    )
                } else {
                    AppLogger.log(context, AppLogger.LOGIN_FAILED, "Inicio de sesión", "Credenciales incorrectas ($email)")
                    Result.failure(Exception("Credenciales incorrectas"))
                }
            } else {
                val errorMsg = when (response.code()) {
                    401 -> "Email o contraseña incorrectos"
                    500 -> "Error del servidor, intenta más tarde"
                    else -> "Error de conexión (${response.code()})"
                }
                AppLogger.log(context, AppLogger.LOGIN_FAILED, "Inicio de sesión", "$errorMsg ($email)")
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error en login", e)
            Result.failure(
                Exception("Sin conexión a internet. Verifica tu red e intenta de nuevo.")
            )
        }
    }

    /**
     * Cerrar sesión (limpiar token local).
     *
     * Antes de borrar el token se intenta subir la bitácora pendiente: sin
     * token el servidor ya no sabría de quién son esos eventos. Si no hay
     * señal se quedan guardados y suben después.
     */
    suspend fun logout() {
        AppLogger.log(context, AppLogger.LOGOUT, "Ajustes", "Cerró sesión desde ${AppLogger.deviceName()}")
        try {
            AppLogRepository(context).push()
        } catch (e: Exception) {
            Log.w(TAG, "La bitácora quedó pendiente al cerrar sesión", e)
        }
        RetrofitClient.clearToken(context)
    }

    /** Verificar si hay sesión activa */
    fun isLoggedIn(): Boolean = RetrofitClient.isLoggedIn(context)

    /** true si la sesión caducó y ya no se pudo renovar (hay que volver a entrar) */
    fun sessionExpired(): Boolean = RetrofitClient.isSessionExpired(context)

    fun consumeSessionExpired() = RetrofitClient.consumeSessionExpired(context)
}

/** Resultado simplificado del login */
data class LoginResult(
    val userName: String,
    val userEmail: String,
    val userRole: String,
)
