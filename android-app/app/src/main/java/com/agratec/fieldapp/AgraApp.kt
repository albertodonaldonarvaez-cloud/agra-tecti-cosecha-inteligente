package com.agratec.fieldapp

import android.app.Application
import android.util.Log
import com.agratec.fieldapp.data.remote.RetrofitClient
import com.agratec.fieldapp.sync.SyncWorker
import com.agratec.fieldapp.util.AppLogger

/**
 * Clase Application de Agra Field App.
 * Inicializa la sincronización periódica con WorkManager
 * al arrancar la aplicación.
 */
class AgraApp : Application() {

    companion object {
        private const val TAG = "AgraApp"
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "=== Agra Field App iniciada ===")
        Log.i(TAG, "URL del servidor: ${BuildConfig.BASE_URL}")

        // Solo programar sync si hay sesión activa
        if (RetrofitClient.isLoggedIn(this)) {
            SyncWorker.enqueuePeriodicSync(this)
            // Queda constancia de cada entrada a la app, con qué teléfono y cuándo
            AppLogger.log(
                context = this,
                action = AppLogger.APP_OPEN,
                screen = "Inicio",
                detail = "Abrió la app v${BuildConfig.VERSION_NAME} en ${AppLogger.deviceName()}",
            )
        }
    }
}
