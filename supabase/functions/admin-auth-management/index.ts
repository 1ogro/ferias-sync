import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate caller
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerUserId = claimsData.claims.sub;

    // Check if caller is admin/director
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("person_id")
      .eq("user_id", callerUserId)
      .single();

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: "Perfil não encontrado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerPerson } = await adminClient
      .from("people")
      .select("papel, is_admin")
      .eq("id", callerProfile.person_id)
      .single();

    if (
      !callerPerson ||
      (callerPerson.papel !== "DIRETOR" &&
        callerPerson.papel !== "ADMIN" &&
        !callerPerson.is_admin)
    ) {
      return new Response(
        JSON.stringify({ error: "Apenas diretores/admins podem realizar esta ação" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, person_id } = await req.json();

    if (!action || !person_id) {
      return new Response(
        JSON.stringify({ error: "action e person_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get target person's email
    const { data: targetPerson } = await adminClient
      .from("people")
      .select("email, nome")
      .eq("id", person_id)
      .single();

    if (!targetPerson) {
      return new Response(
        JSON.stringify({ error: "Pessoa não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reset_password") {
      // Find auth user by email
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(
        (u: any) => u.email === targetPerson.email
      );

      if (!authUser) {
        return new Response(
          JSON.stringify({ error: "Usuário de autenticação não encontrado para este email" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate recovery link
      const { data: linkData, error: linkError } =
        await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: targetPerson.email,
        });

      if (linkError) {
        throw linkError;
      }

      // Audit log
      await adminClient.from("audit_logs").insert({
        entidade: "auth",
        entidade_id: person_id,
        acao: "ADMIN_PASSWORD_RESET",
        actor_id: callerProfile.person_id,
        payload: { target_email: targetPerson.email, target_name: targetPerson.nome },
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: `Email de recuperação de senha enviado para ${targetPerson.email}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "clear_identities") {
      // Find auth user by email
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(
        (u: any) => u.email === targetPerson.email
      );

      if (!authUser) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Nenhum usuário de autenticação encontrado — já está limpo",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete the auth user (cascades to profiles)
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(
        authUser.id
      );

      if (deleteError) {
        throw deleteError;
      }

      // Audit log
      await adminClient.from("audit_logs").insert({
        entidade: "auth",
        entidade_id: person_id,
        acao: "ADMIN_CLEAR_AUTH",
        actor_id: callerProfile.person_id,
        payload: {
          target_email: targetPerson.email,
          target_name: targetPerson.nome,
          deleted_auth_user_id: authUser.id,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: `Autenticação de ${targetPerson.nome} foi zerada. O usuário poderá se recadastrar.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida. Use reset_password ou clear_identities" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in admin-auth-management:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
