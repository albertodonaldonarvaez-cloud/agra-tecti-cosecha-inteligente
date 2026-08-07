package com.agratec.fieldapp.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.agratec.fieldapp.ui.theme.*

/**
 * Secciones de la app. Son las mismas cuatro en todas las pantallas, para que
 * el usuario siempre sepa dónde está y cómo llegar a lo demás.
 */
enum class AgraTab(val label: String, val icon: ImageVector, val createLabel: String) {
    Notas("Notas", Icons.Default.StickyNote2, "Nueva nota"),
    Libreta("Libreta", Icons.Default.MenuBook, "Nueva actividad"),
    Personal("Personal", Icons.Default.Groups, "Nuevo personal"),
    Almacen("Almacén", Icons.Default.Inventory2, "Nuevo producto"),
}

/**
 * Barra flotante de navegación: una píldora con las cuatro secciones.
 * El botón de crear va aparte (ver [AgraCreateButton]) para que la barra
 * respire y el pulgar tenga blancos grandes.
 */
@Composable
fun AgraNavBar(
    current: AgraTab,
    onSelect: (AgraTab) -> Unit,
    modifier: Modifier = Modifier,
    pendingByTab: Map<AgraTab, Int> = emptyMap(),
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .navigationBarsPadding(),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .shadow(
                    elevation = 14.dp,
                    shape = RoundedCornerShape(50),
                    ambientColor = Color.Black.copy(alpha = 0.15f),
                    spotColor = Color.Black.copy(alpha = 0.1f),
                )
                .clip(RoundedCornerShape(50))
                .background(Color.White.copy(alpha = 0.95f))
                .border(1.dp, AgraGreenLight.copy(alpha = 0.2f), RoundedCornerShape(50))
                .padding(horizontal = 6.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            AgraTab.entries.forEach { tab ->
                NavItem(
                    tab = tab,
                    selected = tab == current,
                    pending = pendingByTab[tab] ?: 0,
                    onClick = { onSelect(tab) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun NavItem(
    tab: AgraTab,
    selected: Boolean,
    pending: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint by animateColorAsState(
        targetValue = if (selected) Color.White else TextTertiary,
        label = "navTint",
    )
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .then(
                if (selected) Modifier.background(
                    Brush.horizontalGradient(listOf(AgraGreen, AgraEmerald600))
                ) else Modifier
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(contentAlignment = Alignment.TopEnd) {
                Icon(tab.icon, contentDescription = tab.label, tint = tint, modifier = Modifier.size(20.dp))
                if (pending > 0) {
                    Box(
                        modifier = Modifier
                            .offset(x = 5.dp, y = (-3).dp)
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(SyncPending)
                            .border(1.5.dp, Color.White, CircleShape),
                    )
                }
            }
            Spacer(Modifier.height(2.dp))
            Text(
                tab.label,
                color = tint,
                fontSize = 10.sp,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                maxLines = 1,
            )
        }
    }
}

/**
 * Botón de crear de la sección actual. Va flotando sobre la lista, justo
 * encima de la barra de navegación.
 */
@Composable
fun AgraCreateButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .shadow(
                elevation = 10.dp,
                shape = RoundedCornerShape(50),
                ambientColor = AgraGreen.copy(alpha = 0.35f),
                spotColor = AgraGreen.copy(alpha = 0.25f),
            )
            .clip(RoundedCornerShape(50))
            .background(Brush.horizontalGradient(listOf(AgraGreen, AgraEmerald600)))
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Default.Add, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** Acción de encabezado: sincronizar, con contador de pendientes */
@Composable
fun AgraSyncAction(
    unsyncedCount: Int,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .padding(8.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (unsyncedCount > 0) {
            BadgedBox(
                badge = {
                    Badge(containerColor = SyncPending, contentColor = Color.White) {
                        Text("$unsyncedCount", fontSize = 9.sp)
                    }
                }
            ) {
                Icon(Icons.Default.CloudUpload, contentDescription = "Sincronizar", tint = SyncPending, modifier = Modifier.size(21.dp))
            }
        } else {
            Icon(Icons.Default.CloudDone, contentDescription = "Sincronizar", tint = AgraEmerald600, modifier = Modifier.size(21.dp))
        }
    }
}

/** Acción de encabezado genérica (ajustes, salir…) */
@Composable
fun AgraHeaderAction(
    icon: ImageVector,
    description: String,
    onClick: () -> Unit,
    tint: Color = TextTertiary,
) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .padding(8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = description, tint = tint, modifier = Modifier.size(20.dp))
    }
}
