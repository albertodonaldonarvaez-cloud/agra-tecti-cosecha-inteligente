package com.agratec.fieldapp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.agratec.fieldapp.ui.theme.*

/**
 * Floating bottom bar matching the frontend's FloatingNav pill-shape:
 * `rounded-full border-green-300/30 bg-white/20 backdrop-blur-xl shadow-2xl`
 *
 * Contains: sync button, create note button, and logout button.
 * The create button is prominent with green gradient.
 */
@Composable
fun AgraBottomBar(
    unsyncedCount: Int,
    onSync: () -> Unit,
    onCreateNote: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .shadow(
                    elevation = 12.dp,
                    shape = RoundedCornerShape(50),
                    ambientColor = Color.Black.copy(alpha = 0.15f),
                    spotColor = Color.Black.copy(alpha = 0.1f),
                )
                .clip(RoundedCornerShape(50))
                .background(Color.White.copy(alpha = 0.92f))
                .border(
                    width = 1.dp,
                    color = AgraGreenLight.copy(alpha = 0.2f),
                    shape = RoundedCornerShape(50),
                )
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            // Sync button
            BottomBarIcon(
                icon = Icons.Default.CloudUpload,
                label = "Sync",
                tint = if (unsyncedCount > 0) SyncPending else TextTertiary,
                badgeCount = unsyncedCount,
                onClick = onSync,
            )

            // Separator
            Box(
                Modifier
                    .width(1.dp)
                    .height(24.dp)
                    .background(AgraGreenLight.copy(alpha = 0.2f))
            )

            // Create Note (prominent)
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(
                        brush = androidx.compose.ui.graphics.Brush.horizontalGradient(
                            colors = listOf(AgraGreen, AgraEmerald600),
                        )
                    )
                    .clickable(onClick = onCreateNote)
                    .padding(horizontal = 20.dp, vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Icon(
                        Icons.Default.Add,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        "Nueva Nota",
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            // Separator
            Box(
                Modifier
                    .width(1.dp)
                    .height(24.dp)
                    .background(AgraGreenLight.copy(alpha = 0.2f))
            )

            // Logout button
            BottomBarIcon(
                icon = Icons.Default.Logout,
                label = "Salir",
                tint = Color(0xFFEF4444).copy(alpha = 0.7f),
                onClick = onLogout,
            )
        }
    }
}

@Composable
private fun BottomBarIcon(
    icon: ImageVector,
    label: String,
    tint: Color,
    onClick: () -> Unit,
    badgeCount: Int = 0,
) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .padding(10.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (badgeCount > 0) {
            BadgedBox(
                badge = {
                    Badge(
                        containerColor = SyncPending,
                        contentColor = Color.White,
                    ) {
                        Text("$badgeCount", fontSize = 9.sp)
                    }
                }
            ) {
                Icon(
                    icon,
                    contentDescription = label,
                    tint = tint,
                    modifier = Modifier.size(22.dp),
                )
            }
        } else {
            Icon(
                icon,
                contentDescription = label,
                tint = tint,
                modifier = Modifier.size(22.dp),
            )
        }
    }
}
