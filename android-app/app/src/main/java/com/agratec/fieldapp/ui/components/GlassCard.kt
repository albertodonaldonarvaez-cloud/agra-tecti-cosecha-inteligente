package com.agratec.fieldapp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.agratec.fieldapp.ui.theme.*

/**
 * Premium Glass Card — Glassmorphism component matching the frontend's
 * `bg-white/40 backdrop-blur-xl shadow-xl border-green-200/30` aesthetic.
 *
 * Features:
 * - Elevated shadow for depth
 * - White translucent background
 * - Subtle green-tinted border
 * - Diagonal gradient overlay for "liquid glass" shine effect
 */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 24.dp,
    glowColor: Color = AgraGreen,
    showGlow: Boolean = false,
    elevation: Dp = 4.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(cornerRadius)

    Box(
        modifier = modifier
            .shadow(
                elevation = elevation,
                shape = shape,
                ambientColor = Color.Black.copy(alpha = 0.08f),
                spotColor = Color.Black.copy(alpha = 0.05f),
            )
            .clip(shape)
            .background(Color.White.copy(alpha = 0.85f))
            .border(
                width = 1.dp,
                color = AgraGreenLight.copy(alpha = 0.15f),
                shape = shape,
            ),
    ) {
        // Diagonal gradient overlay — "liquid glass" shine (matching frontend's from-white/50 via-transparent)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            Color.White.copy(alpha = 0.45f),
                            Color.Transparent,
                            Color.Transparent,
                        ),
                        start = Offset.Zero,
                        end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY),
                    )
                )
        )
        // Content
        Column(
            modifier = Modifier.padding(16.dp),
            content = content,
        )
    }
}

/**
 * Glass Surface — A more subtle variant for large background areas.
 * Uses a lighter border and less pronounced shadow.
 */
@Composable
fun GlassSurface(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(cornerRadius)
    Column(
        modifier = modifier
            .shadow(
                elevation = 1.dp,
                shape = shape,
                ambientColor = Color.Black.copy(alpha = 0.04f),
            )
            .clip(shape)
            .background(Color.White.copy(alpha = 0.6f))
            .border(
                width = 0.5.dp,
                color = CardBorder.copy(alpha = 0.3f),
                shape = shape,
            )
            .padding(12.dp),
        content = content,
    )
}
