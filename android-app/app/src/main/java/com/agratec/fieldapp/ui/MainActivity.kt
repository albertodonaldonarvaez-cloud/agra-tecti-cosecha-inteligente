package com.agratec.fieldapp.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.*
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.agratec.fieldapp.data.repository.AuthRepository
import com.agratec.fieldapp.data.repository.UpdateRepository
import com.agratec.fieldapp.ui.theme.AgraGreen
import com.agratec.fieldapp.ui.theme.TextPrimary
import com.agratec.fieldapp.ui.theme.TextSecondary
import com.agratec.fieldapp.ui.theme.TextTertiary
import com.agratec.fieldapp.ui.screens.ActivitiesListScreen
import com.agratec.fieldapp.ui.screens.CreateActivityScreen
import com.agratec.fieldapp.ui.screens.CreateNoteScreen
import com.agratec.fieldapp.ui.screens.LoginScreen
import com.agratec.fieldapp.ui.screens.NotesListScreen
import com.agratec.fieldapp.ui.theme.AgraFieldTheme

/**
 * Activity principal con navegación simple entre:
 * - Login → Notas → Crear Nota
 * - Notas ↔ Libreta de Campo (actividades) → Crear Actividad
 *
 * Usa navegación basada en estado (sin Navigation Component)
 * para mantener la simplicidad del scaffolding.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AgraFieldTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = androidx.compose.ui.graphics.Color.Transparent,
                ) {
                    AppNavigation()
                }
            }
        }
    }
}

enum class Screen { Login, NotesList, CreateNote, ActivitiesList, CreateActivity }

@Composable
fun AppNavigation() {
    val context = LocalContext.current
    val authRepository = remember { AuthRepository(context) }
    val updateRepository = remember { UpdateRepository(context) }

    // Start at login or notes based on saved session.
    // rememberSaveable: sobrevivir rotación/muerte de proceso (común al abrir la cámara)
    var currentScreen by androidx.compose.runtime.saveable.rememberSaveable {
        mutableStateOf(
            if (authRepository.isLoggedIn()) Screen.NotesList else Screen.Login
        )
    }

    // ── Auto-actualización: al arrancar (con internet) revisar si hay APK nuevo ──
    var updateInfo by remember { mutableStateOf<UpdateRepository.UpdateInfo?>(null) }
    LaunchedEffect(Unit) {
        updateInfo = updateRepository.checkForUpdate()
    }

    // ── Sesión caducada: si ya no se pudo renovar sola, mandar al login ──
    // (la renovación automática ocurre en RetrofitClient; esto es el último recurso)
    var sessionExpiredNotice by remember { mutableStateOf(false) }
    LaunchedEffect(currentScreen) {
        if (currentScreen != Screen.Login && authRepository.sessionExpired()) {
            sessionExpiredNotice = true
            currentScreen = Screen.Login
        }
    }
    // Revisar periódicamente mientras la app está abierta
    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(30_000)
            if (currentScreen != Screen.Login && authRepository.sessionExpired()) {
                sessionExpiredNotice = true
                currentScreen = Screen.Login
            }
        }
    }

    if (sessionExpiredNotice) {
        AlertDialog(
            onDismissRequest = {
                authRepository.consumeSessionExpired()
                sessionExpiredNotice = false
            },
            title = { Text("Sesión finalizada", color = TextPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "Por seguridad tu sesión terminó. Vuelve a iniciar sesión para seguir sincronizando.\n\n" +
                        "Nada de lo que capturaste se pierde: queda guardado en el teléfono y se subirá al entrar.",
                    color = TextSecondary,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    authRepository.consumeSessionExpired()
                    sessionExpiredNotice = false
                }) {
                    Text("Iniciar sesión", color = AgraGreen, fontWeight = FontWeight.SemiBold)
                }
            },
            containerColor = Color.White,
            shape = RoundedCornerShape(20.dp),
        )
    }

    updateInfo?.let { info ->
        AlertDialog(
            onDismissRequest = { updateInfo = null },
            title = {
                Text("🚀 Nueva versión disponible", color = TextPrimary, fontWeight = FontWeight.Bold)
            },
            text = {
                Text(
                    buildString {
                        append("Hay una versión nueva de la app: v${info.versionName}")
                        info.fileSizeMb?.let { append(" (${String.format(java.util.Locale.US, "%.1f", it)} MB)") }
                        append(".\n")
                        if (!info.notes.isNullOrBlank()) append("\n${info.notes}\n")
                        append("\nSe descargará con el navegador; al terminar, ábrela para instalarla.")
                    },
                    color = TextSecondary,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    updateRepository.openDownload(info)
                    updateInfo = null
                }) {
                    Text("Descargar", color = AgraGreen, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { updateInfo = null }) {
                    Text("Después", color = TextTertiary)
                }
            },
            containerColor = Color.White,
            shape = RoundedCornerShape(20.dp),
        )
    }

    AnimatedContent(
        targetState = currentScreen,
        transitionSpec = {
            when (targetState) {
                Screen.Login -> fadeIn() togetherWith fadeOut()
                Screen.CreateNote, Screen.CreateActivity ->
                    slideInHorizontally { it } + fadeIn() togetherWith
                            slideOutHorizontally { -it / 3 } + fadeOut()
                Screen.NotesList -> {
                    if (initialState == Screen.CreateNote) {
                        slideInHorizontally { -it / 3 } + fadeIn() togetherWith
                                slideOutHorizontally { it } + fadeOut()
                    } else {
                        fadeIn() togetherWith fadeOut()
                    }
                }
                Screen.ActivitiesList -> {
                    if (initialState == Screen.CreateActivity) {
                        slideInHorizontally { -it / 3 } + fadeIn() togetherWith
                                slideOutHorizontally { it } + fadeOut()
                    } else {
                        fadeIn() togetherWith fadeOut()
                    }
                }
            }
        },
        label = "screenTransition",
    ) { screen ->
        when (screen) {
            Screen.Login -> LoginScreen(
                onLoginSuccess = { currentScreen = Screen.NotesList }
            )
            Screen.NotesList -> NotesListScreen(
                onCreateNote = { currentScreen = Screen.CreateNote },
                onOpenNotebook = { currentScreen = Screen.ActivitiesList },
                onLogout = {
                    authRepository.logout()
                    currentScreen = Screen.Login
                },
            )
            Screen.CreateNote -> CreateNoteScreen(
                onBack = { currentScreen = Screen.NotesList }
            )
            Screen.ActivitiesList -> ActivitiesListScreen(
                onCreateActivity = { currentScreen = Screen.CreateActivity },
                onBackToNotes = { currentScreen = Screen.NotesList },
                onLogout = {
                    authRepository.logout()
                    currentScreen = Screen.Login
                },
            )
            Screen.CreateActivity -> CreateActivityScreen(
                onBack = { currentScreen = Screen.ActivitiesList }
            )
        }
    }
}
