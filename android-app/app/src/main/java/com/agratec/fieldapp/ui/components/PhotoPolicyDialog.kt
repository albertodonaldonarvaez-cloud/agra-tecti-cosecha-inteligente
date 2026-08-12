package com.agratec.fieldapp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.agratec.fieldapp.data.prefs.PhotoStats
import com.agratec.fieldapp.ui.theme.*

/**
 * Pregunta al usuario qué hacer con las fotos cuando está usando DATOS MÓVILES.
 * Los datos (actividades, notas, personal, almacén) siempre se sincronizan;
 * aquí solo se decide sobre las fotos, que son lo que consume el plan.
 */
@Composable
fun PhotoPolicyDialog(
    pendingPhotos: Int,
    onDecide: (allowUpload: Boolean, allowDownload: Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("📶 Estás usando datos móviles", color = TextPrimary, fontWeight = FontWeight.Bold)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    if (pendingPhotos > 0)
                        "Tus actividades y notas ya se están sincronizando. Tienes $pendingPhotos foto${if (pendingPhotos == 1) "" else "s"} pendiente${if (pendingPhotos == 1) "" else "s"} de subir."
                    else
                        "Tus actividades y notas se sincronizan siempre, aunque no haya WiFi.",
                    color = TextSecondary,
                )
                Text(
                    "Las fotos pesan mucho más. ¿Qué prefieres hacer con ellas cuando no hay WiFi?",
                    color = TextSecondary,
                )
                Text(
                    "Puedes cambiarlo cuando quieras desde Ajustes.",
                    color = TextTertiary,
                    fontSize = 12.sp,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onDecide(false, false) }) {
                Text("Solo con WiFi", color = AgraGreen, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = {
            TextButton(onClick = { onDecide(true, true) }) {
                Text("Usar datos también", color = TextSecondary)
            }
        },
        containerColor = Color.White,
        shape = RoundedCornerShape(20.dp),
    )
}

/**
 * Ajustes de la app: fotos con datos móviles, versión instalada y cerrar sesión.
 * Es el mismo diálogo en todas las secciones (se abre desde el encabezado).
 */
@Composable
fun SettingsDialog(
    uploadOnMobile: Boolean,
    downloadOnMobile: Boolean,
    onChange: (upload: Boolean, download: Boolean) -> Unit,
    onDismiss: () -> Unit,
    appVersion: String = "",
    checkingUpdate: Boolean = false,
    onCheckUpdate: (() -> Unit)? = null,
    onLogout: (() -> Unit)? = null,
    dataSaver: Boolean = false,
    onDataSaverChange: ((Boolean) -> Unit)? = null,
    photoStats: PhotoStats.Stats? = null,
    pendingUploads: Int = 0,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Ajustes", color = TextPrimary, fontWeight = FontWeight.Bold) },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                Text(
                    "Las actividades, notas, personal y almacén siempre se sincronizan. Estas opciones son solo para las fotos.",
                    color = TextTertiary,
                    fontSize = 12.sp,
                )
                Spacer(Modifier.height(4.dp))
                SettingSwitch(
                    title = "Subir mis fotos",
                    subtitle = "Con datos móviles",
                    checked = uploadOnMobile,
                    onCheckedChange = { onChange(it, downloadOnMobile) },
                )
                SettingSwitch(
                    title = "Descargar fotos",
                    subtitle = "Con datos móviles",
                    checked = downloadOnMobile,
                    onCheckedChange = { onChange(uploadOnMobile, it) },
                )

                // ── Cuánto se está ahorrando al comprimir ──
                if (onDataSaverChange != null) {
                    SettingSwitch(
                        title = "Ahorro de datos",
                        subtitle = if (dataSaver) "Fotos más ligeras (1280 px)" else "Calidad normal (1920 px)",
                        checked = dataSaver,
                        onCheckedChange = onDataSaverChange,
                    )
                }

                if (photoStats != null && photoStats.fotos > 0) {
                    SettingsDivider()
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(AgraEmerald100.copy(alpha = 0.5f))
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Text(
                            "Compresión de fotos",
                            color = TextPrimary,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            "${photoStats.fotos} foto${if (photoStats.fotos == 1) "" else "s"} · " +
                                "${PhotoStats.formatoMb(photoStats.originalBytes)} → " +
                                PhotoStats.formatoMb(photoStats.finalBytes),
                            color = TextSecondary,
                            fontSize = 12.sp,
                        )
                        Text(
                            "Te has ahorrado ${PhotoStats.formatoMb(photoStats.ahorroBytes)} de datos " +
                                "(${photoStats.ahorroPct}% menos)",
                            color = AgraEmerald600,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            "Las fotos se dejan al tamaño exacto que el servidor conserva; " +
                                "subir más pesado no daría más detalle.",
                            color = TextTertiary,
                            fontSize = 10.sp,
                        )
                    }
                }

                if (pendingUploads > 0) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "⏳ $pendingUploads elemento${if (pendingUploads == 1) "" else "s"} por subir. " +
                            "Puedes salir de la app: la subida sigue y te avisamos al terminar.",
                        color = TextTertiary,
                        fontSize = 11.sp,
                    )
                }

                // ── Actualizaciones de la app ──
                if (onCheckUpdate != null) {
                    SettingsDivider()
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Versión de la app", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Text(appVersion, color = TextTertiary, fontSize = 11.sp)
                        }
                        if (checkingUpdate) {
                            CircularProgressIndicator(
                                color = AgraGreen,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(20.dp),
                            )
                        } else {
                            TextButton(onClick = onCheckUpdate) {
                                Text("Buscar actualización", color = AgraGreen, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }

                // ── Cerrar sesión ──
                if (onLogout != null) {
                    SettingsDivider()
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Cerrar sesión", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Text(
                                "Lo que capturaste se queda guardado en el teléfono",
                                color = TextTertiary,
                                fontSize = 11.sp,
                            )
                        }
                        TextButton(onClick = onLogout) {
                            Icon(Icons.Default.Logout, contentDescription = null, tint = SyncError, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Salir", color = SyncError, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Listo", color = AgraGreen, fontWeight = FontWeight.SemiBold) }
        },
        containerColor = Color.White,
        shape = RoundedCornerShape(20.dp),
    )
}

@Composable
private fun SettingSwitch(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            Text(subtitle, color = TextTertiary, fontSize = 11.sp)
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(checkedTrackColor = AgraGreen),
        )
    }
}

@Composable
private fun SettingsDivider() {
    Spacer(Modifier.height(10.dp))
    HorizontalDivider(color = CardBorder.copy(alpha = 0.5f))
    Spacer(Modifier.height(10.dp))
}
