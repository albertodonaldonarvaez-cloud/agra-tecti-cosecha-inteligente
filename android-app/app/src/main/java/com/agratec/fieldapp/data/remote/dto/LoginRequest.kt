package com.agratec.fieldapp.data.remote.dto

import com.google.gson.annotations.SerializedName

/** Request body para auth.loginMobile via tRPC */
data class LoginRequest(
    val email: String,
    val password: String,
)

/** Wrapper tRPC para enviar mutations — el body real va envuelto en "json" */
data class TrpcMutationRequest<T>(
    val json: T,
)
