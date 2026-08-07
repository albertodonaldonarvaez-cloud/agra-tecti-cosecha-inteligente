package com.agratec.fieldapp.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

/**
 * Estado de la red: distingue WiFi (sin costo) de datos móviles (medidos),
 * para decidir si conviene subir/bajar fotos ahora o esperar.
 */
object NetworkUtils {

    enum class NetworkType { NONE, WIFI, MOBILE }

    fun currentType(context: Context): NetworkType {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return NetworkType.NONE
        val network = cm.activeNetwork ?: return NetworkType.NONE
        val caps = cm.getNetworkCapabilities(network) ?: return NetworkType.NONE
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return NetworkType.NONE

        // "No medida" = WiFi / Ethernet sin límite de datos.
        // Se respeta también el ahorro de datos que el usuario haya puesto en Android.
        val unmetered = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        return if (unmetered) NetworkType.WIFI else NetworkType.MOBILE
    }

    fun isConnected(context: Context): Boolean = currentType(context) != NetworkType.NONE

    /** true si estamos en WiFi (o red sin costo por datos) */
    fun isUnmetered(context: Context): Boolean = currentType(context) == NetworkType.WIFI
}
