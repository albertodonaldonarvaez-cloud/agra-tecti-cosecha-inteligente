package com.agratec.fieldapp.sync

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.ForegroundInfo
import com.agratec.fieldapp.R

/**
 * Avisos de la sincronización en la barra de notificaciones.
 *
 * POR QUÉ: antes, si el usuario salía de la app con fotos a medio subir, la
 * subida seguía a ciegas y no había forma de saber si terminó. Ahora el trabajo
 * corre en primer plano con una notificación de progreso ("Subiendo 3 de 12"),
 * el sistema no lo mata a mitad de camino y al final queda un aviso con el
 * resultado.
 *
 * Dos canales aparte para que el usuario pueda silenciar el progreso sin
 * perderse el aviso final.
 */
object SyncNotifier {

    private const val CHANNEL_PROGRESS = "agra_sync_progress"
    private const val CHANNEL_RESULT = "agra_sync_result"

    /** ID fijo: la notificación de progreso se actualiza, no se apila */
    const val PROGRESS_ID = 4101
    private const val RESULT_ID = 4102

    private fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        if (manager.getNotificationChannel(CHANNEL_PROGRESS) == null) {
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_PROGRESS,
                    "Subida de datos",
                    NotificationManager.IMPORTANCE_LOW,
                ).apply {
                    description = "Progreso mientras la app sube notas, actividades y fotos"
                    setShowBadge(false)
                }
            )
        }
        if (manager.getNotificationChannel(CHANNEL_RESULT) == null) {
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_RESULT,
                    "Resultado de la sincronización",
                    NotificationManager.IMPORTANCE_DEFAULT,
                ).apply {
                    description = "Aviso cuando termina de subirse todo lo capturado en campo"
                }
            )
        }
    }

    private fun abrirApp(context: Context): PendingIntent? {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP) ?: return null
        return PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** Notificación de progreso; [total] en 0 deja la barra indeterminada */
    fun progress(context: Context, texto: String, hechos: Int, total: Int): Notification {
        ensureChannels(context)
        return NotificationCompat.Builder(context, CHANNEL_PROGRESS)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("Agra Campo · subiendo datos")
            .setContentText(texto)
            .setProgress(total.coerceAtLeast(1), hechos, total <= 0)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setContentIntent(abrirApp(context))
            .build()
    }

    /**
     * Envoltorio para WorkManager. En Android 10+ hay que declarar el tipo de
     * servicio; si no, el sistema rechaza el trabajo en primer plano.
     */
    fun foregroundInfo(context: Context, texto: String, hechos: Int, total: Int): ForegroundInfo {
        val notification = progress(context, texto, hechos, total)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(PROGRESS_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(PROGRESS_ID, notification)
        }
    }

    /** ¿El usuario nos dejó notificar? (Android 13+ lo pide explícitamente) */
    fun puedeNotificar(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val permiso = ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.POST_NOTIFICATIONS,
            )
            if (permiso != PackageManager.PERMISSION_GRANTED) return false
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    /**
     * Aviso final. Solo se muestra cuando de verdad hubo algo que subir:
     * una notificación por cada revisión rutinaria sería puro ruido.
     */
    fun result(context: Context, titulo: String, texto: String, ok: Boolean) {
        if (!puedeNotificar(context)) return
        ensureChannels(context)
        val notification = NotificationCompat.Builder(context, CHANNEL_RESULT)
            .setSmallIcon(if (ok) android.R.drawable.stat_sys_upload_done else android.R.drawable.stat_notify_error)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
            .setAutoCancel(true)
            .setContentIntent(abrirApp(context))
            .build()
        try {
            NotificationManagerCompat.from(context).notify(RESULT_ID, notification)
        } catch (e: SecurityException) {
            // El usuario revocó el permiso entre la revisión y el aviso
        }
    }

    fun cancelProgress(context: Context) {
        try {
            NotificationManagerCompat.from(context).cancel(PROGRESS_ID)
        } catch (e: Exception) {
            // Nada que hacer: es solo una notificación
        }
    }
}
