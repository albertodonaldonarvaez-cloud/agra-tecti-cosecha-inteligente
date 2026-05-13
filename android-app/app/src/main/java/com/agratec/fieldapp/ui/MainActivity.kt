package com.agratec.fieldapp.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.*
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.agratec.fieldapp.data.remote.RetrofitClient
import com.agratec.fieldapp.data.repository.AuthRepository
import com.agratec.fieldapp.ui.screens.CreateNoteScreen
import com.agratec.fieldapp.ui.screens.LoginScreen
import com.agratec.fieldapp.ui.screens.NotesListScreen
import com.agratec.fieldapp.ui.theme.AgraFieldTheme
import com.agratec.fieldapp.ui.theme.LightBg1

/**
 * Activity principal con navegación simple entre:
 * - Login → Notas → Crear Nota
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
                    color = LightBg1,
                ) {
                    AppNavigation()
                }
            }
        }
    }
}

enum class Screen { Login, NotesList, CreateNote }

@Composable
fun AppNavigation() {
    val context = LocalContext.current
    val authRepository = remember { AuthRepository(context) }

    // Start at login or notes based on saved session
    var currentScreen by remember {
        mutableStateOf(
            if (authRepository.isLoggedIn()) Screen.NotesList else Screen.Login
        )
    }

    AnimatedContent(
        targetState = currentScreen,
        transitionSpec = {
            when (targetState) {
                Screen.Login -> fadeIn() togetherWith fadeOut()
                Screen.CreateNote -> slideInHorizontally { it } + fadeIn() togetherWith
                        slideOutHorizontally { -it / 3 } + fadeOut()
                Screen.NotesList -> {
                    if (initialState == Screen.CreateNote) {
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
                onLogout = {
                    authRepository.logout()
                    currentScreen = Screen.Login
                },
            )
            Screen.CreateNote -> CreateNoteScreen(
                onBack = { currentScreen = Screen.NotesList }
            )
        }
    }
}
