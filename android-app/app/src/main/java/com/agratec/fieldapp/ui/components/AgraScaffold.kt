package com.agratec.fieldapp.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.agratec.fieldapp.R
import com.agratec.fieldapp.ui.theme.*

/**
 * Piezas compartidas de la interfaz.
 *
 * Todas las pantallas se arman con estos bloques para que la app se sienta
 * una sola cosa: mismo fondo, mismo encabezado, mismas tarjetas, mismos
 * campos y mismos botones. Si algo cambia aquí, cambia en toda la app.
 */

/** Fondo degradado común a todas las pantallas */
@Composable
fun AgraScreen(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(AgraGreenSurface, AgraEmerald50, AgraTeal50),
                    start = Offset(0f, 0f),
                    end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY),
                )
            ),
        content = content,
    )
}

/**
 * Encabezado de pantalla.
 *
 * [emoji] pinta un cuadro verde con el símbolo de la sección; si es null se usa
 * el logo (pantalla principal). [onBack] convierte el cuadro en flecha de
 * regreso para las pantallas de captura.
 */
@Composable
fun AgraHeader(
    title: String,
    subtitle: String? = null,
    emoji: String? = null,
    onBack: (() -> Unit)? = null,
    badge: String? = null,
    badgeColor: Color = SyncPending,
    actions: @Composable RowScope.() -> Unit = {},
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(elevation = 2.dp, ambientColor = Color.Black.copy(alpha = 0.04f))
            .background(Color.White.copy(alpha = 0.9f))
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            when {
                onBack != null -> {
                    IconButton(onClick = onBack, modifier = Modifier.size(40.dp)) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver", tint = TextPrimary)
                    }
                    Spacer(Modifier.width(4.dp))
                }
                emoji != null -> {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(13.dp))
                            .background(Brush.horizontalGradient(listOf(AgraGreen, AgraEmerald600))),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(emoji, fontSize = 19.sp)
                    }
                    Spacer(Modifier.width(12.dp))
                }
                else -> {
                    Image(
                        painter = painterResource(R.drawable.agratectilogo),
                        contentDescription = null,
                        modifier = Modifier
                            .size(38.dp)
                            .clip(RoundedCornerShape(10.dp)),
                    )
                    Spacer(Modifier.width(12.dp))
                }
            }

            Column(Modifier.weight(1f)) {
                Text(title, color = TextPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                if (subtitle != null) {
                    Text(subtitle, color = TextSecondary, fontSize = 12.sp, maxLines = 1)
                }
            }

            if (badge != null) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(badgeColor.copy(alpha = 0.14f))
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                ) {
                    Text(badge, color = badgeColor, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.width(4.dp))
            }

            actions()
        }
    }
}

/** Franja con el resultado de la última sincronización */
@Composable
fun AgraSyncBanner(
    message: String,
    at: String,
    ok: Boolean,
    photosWaiting: Int = 0,
    onPhotosClick: (() -> Unit)? = null,
) {
    val bg = if (ok) AgraGreenSurface else Color(0xFFFEF2F2)
    val fg = if (ok) AgraEmerald600 else SyncError
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(bg)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (ok) Icons.Default.CloudDone else Icons.Default.ErrorOutline,
            contentDescription = null,
            tint = fg,
            modifier = Modifier.size(16.dp),
        )
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text("$message · $at", color = fg, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            if (photosWaiting > 0 && onPhotosClick != null) {
                Text(
                    "$photosWaiting foto${if (photosWaiting == 1) "" else "s"} esperan WiFi · toca para cambiarlo",
                    color = SyncPending,
                    fontSize = 11.sp,
                    modifier = Modifier.clickable(onClick = onPhotosClick),
                )
            }
        }
    }
}

/** Tarjeta de sección con título y acción opcional a la derecha */
@Composable
fun AgraSection(
    title: String,
    modifier: Modifier = Modifier,
    hint: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    GlassCard(modifier = modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            if (actionLabel != null && onAction != null) {
                Text(
                    actionLabel,
                    color = AgraGreen,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .clickable(onClick = onAction)
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                )
            }
        }
        if (hint != null) {
            Spacer(Modifier.height(2.dp))
            Text(hint, color = TextTertiary, fontSize = 11.sp)
        }
        Spacer(Modifier.height(10.dp))
        content()
    }
}

/** Estado vacío con el mismo aire en todas las listas */
@Composable
fun AgraEmptyState(
    emoji: String,
    title: String,
    message: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(76.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(Color.White.copy(alpha = 0.7f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(emoji, fontSize = 34.sp)
        }
        Spacer(Modifier.height(14.dp))
        Text(title, color = TextSecondary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Text(
            message,
            color = TextTertiary,
            fontSize = 13.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

/** Botón principal (guardar, entrar, agregar) */
@Composable
fun AgraPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.height(52.dp),
        shape = RoundedCornerShape(50),
        colors = ButtonDefaults.buttonColors(
            containerColor = AgraGreen,
            disabledContainerColor = AgraGreen.copy(alpha = 0.4f),
        ),
    ) {
        if (loading) {
            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
        } else {
            if (icon != null) {
                Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
            }
            Text(text, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** Campo de texto con el estilo de la app */
@Composable
fun AgraTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    singleLine: Boolean = true,
    minLines: Int = 1,
    keyboardType: androidx.compose.ui.text.input.KeyboardType = androidx.compose.ui.text.input.KeyboardType.Text,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = placeholder?.let { { Text(it, color = TextTertiary) } },
        singleLine = singleLine,
        minLines = minLines,
        shape = RoundedCornerShape(14.dp),
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = keyboardType),
        modifier = modifier.fillMaxWidth(),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = AgraGreen,
            unfocusedBorderColor = CardBorder,
            focusedLabelColor = AgraGreen,
            focusedContainerColor = Color.White.copy(alpha = 0.6f),
            unfocusedContainerColor = Color.White.copy(alpha = 0.5f),
        ),
    )
}

/** Chip de selección; mismo aspecto en filtros, tipos, parcelas y personal */
@Composable
fun AgraChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    color: Color = AgraGreen,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) color else Color.White.copy(alpha = 0.75f))
            .border(
                width = 1.dp,
                color = if (selected) color else CardBorder.copy(alpha = 0.7f),
                shape = RoundedCornerShape(50),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (selected) Color.White else TextSecondary,
            fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
        )
    }
}

/** Punto de estado de sincronización de un registro */
@Composable
fun AgraSyncDot(isSynced: Boolean, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(8.dp)
            .clip(CircleShape)
            .background(if (isSynced) SyncOk else SyncPending),
    )
}
