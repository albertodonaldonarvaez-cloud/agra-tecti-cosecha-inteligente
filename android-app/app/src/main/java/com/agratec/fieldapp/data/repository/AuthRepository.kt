package com.agratec.fieldapp.data.repository

import android.content.Context
import android.util.Log
import com.agratec.fieldapp.data.remote.RetrofitClient
import com.agratec.fieldapp.data.remote.dto.LoginRequest
import com.agratec.fieldapp.data.remote.dto.TrpcMutationRequest

/**
 * Repositorio de autenticación.
 * Maneja login, almacenamiento seguro del token, y estado de sesión.
 */
class AuthRepository(private val context: Context) {

    companion object {
        private const val TAG = "AuthRepository"
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
                    Log.i(TAG, "Login exitoso para: ${data.user?.name}")
                    Result.success(
                        LoginResult(
                            userName = data.user?.name ?: "Usuario",
                            userEmail = data.user?.email ?: email,
                            userRole = data.user?.role ?: "user",
                        )
                    )
                } else {
                    Result.failure(Exception("Credenciales incorrectas"))
                }
            } else {
                val errorMsg = when (response.code()) {
                    401 -> "Email o contraseña incorrectos"
                    500 -> "Error del servidor, intenta más tarde"
                    else -> "Error de conexión (${response.code()})"
                }
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error en login", e)
            Result.failure(
                Exception("Sin conexión a internet. Verifica tu red e intenta de nuevo.")
            )
        }
    }

    /** Cerrar sesión (limpiar token local) */
    fun logout() {
        RetrofitClient.clearToken(context)
    }

    /** Verificar si hay sesión activa */
    fun isLoggedIn(): Boolean = RetrofitClient.isLoggedIn(context)
}

/** Resultado simplificado del login */
data class LoginResult(
    val userName: String,
    val userEmail: String,
    val userRole: String,
)
