import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { supabaseAdmin } from "../../lib/supabase.js";
import * as orgService from "../organisations/org.service.js";
import * as scriptsService from "../scripts/scripts.service.js";

const RegisterBody = Type.Object({
  full_name: Type.String({ minLength: 1 }),
  company_name: Type.String({ minLength: 1 }),
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /auth/setup-profile
   *
   * Called by the frontend after Supabase auth signup succeeds.
   * Creates the user profile row and organisation if they don't exist yet.
   * Requires a valid JWT (the user just signed up and has a session).
   */
  fastify.post<{ Body: Static<typeof RegisterBody> }>("/setup-profile", {
    preHandler: [fastify.authenticate],
    schema: { body: RegisterBody },
    handler: async (request, reply) => {
      const userId = request.userId;

      // Check if user profile already exists
      const { data: existingUser } = await supabaseAdmin
        .from("users")
        .select("id, organisation_id")
        .eq("id", userId)
        .single();

      if (existingUser?.organisation_id) {
        // Already set up - return existing data
        const org = await orgService.getOrganisation(existingUser.organisation_id);
        return reply.send({ data: { user: existingUser, organisation: org } });
      }

      // Get auth user email
      const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (!authUser) {
        return reply.code(400).send({ error: "AUTH_ERROR", message: "Auth user not found" });
      }

      // Create organisation
      const org = await orgService.createOrganisation({
        name: request.body.company_name,
        ownerUserId: userId,
        builderName: request.body.full_name,
      });

      // Create or update user profile
      const { data: userProfile, error: userError } = await supabaseAdmin
        .from("users")
        .upsert({
          id: userId,
          email: authUser.email!,
          full_name: request.body.full_name,
          organisation_id: org.id,
          role: "owner",
        })
        .select()
        .single();

      if (userError) {
        throw new Error(`Failed to create user profile: ${userError.message}`);
      }

      // Seed default conversation scripts for the new org
      await scriptsService.seedDefaultScripts(org.id);

      return reply.code(201).send({
        data: { user: userProfile, organisation: org },
      });
    },
  });

  /**
   * GET /auth/me
   *
   * Returns the current user's profile and organisation info.
   */
  fastify.get("/me", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { data: user } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("id", request.userId)
        .single();

      if (!user) {
        return reply.code(404).send({ error: "NOT_FOUND", message: "User profile not found" });
      }

      let organisation = null;
      if (user.organisation_id) {
        organisation = await orgService.getOrganisation(user.organisation_id);
      }

      return reply.send({ data: { user, organisation } });
    },
  });
};

export default authRoutes;
