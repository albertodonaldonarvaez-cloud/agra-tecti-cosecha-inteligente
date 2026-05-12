package com.agratec.fieldapp

import android.app.Application
import android.util.Log
import com.agratec.fieldapp.data.remote.RetrofitClient
import com.agratec.fieldapp.sync.SyncWorker

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
        }
    }
}
