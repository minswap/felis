import type { NetworkEnvironment } from "@minswap/felis-ledger-core";
import { LiqwidProvider } from "@minswap/felis-lending-market";
import type { FastifyInstance } from "fastify";
import { API_ENDPOINTS } from "../../constants";
import { logger } from "../../utils";
import { ApiHelper } from "../helper";
import {
  type AuthenLiqwidSubmitBodyType,
  AuthenLiqwidSubmitBodyTypeSchema,
  ErrorResponseSchema,
  LiqwidSubmitResponseSchema,
  type LiqwidSubmitResponseType,
} from "../schemas";

export function registerLiqwidRoutes(fastify: FastifyInstance, networkEnv: NetworkEnvironment): void {
  // POST /liqwid/submit
  fastify.post<{
    Body: AuthenLiqwidSubmitBodyType;
    Reply: LiqwidSubmitResponseType;
  }>(
    API_ENDPOINTS.LIQWID_SUBMIT,
    {
      schema: {
        body: AuthenLiqwidSubmitBodyTypeSchema,
        response: {
          200: LiqwidSubmitResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { data, user_address, witness } = request.body;
      const { raw_tx, witness_set } = data;

      // Authenticate request
      const authResult = ApiHelper.authenticate(data, user_address, witness);
      if (!authResult.success) {
        return reply.status(401).send({
          success: false,
          error: authResult.error,
        });
      }

      logger.info("Submitting Liqwid transaction", {
        userAddress: user_address,
        rawTxLength: raw_tx.length,
        witnessSetLength: witness_set.length,
      });

      try {
        // Submit transaction to Liqwid
        const submitResult = await LiqwidProvider.submitTransaction({
          transaction: raw_tx,
          signature: witness_set,
          networkEnv,
        });

        if (submitResult.type === "err") {
          logger.error("Failed to submit Liqwid transaction", {
            error: submitResult.error.message,
            userAddress: user_address,
          });
          return reply.status(400).send({
            success: false,
            error: submitResult.error.message,
          });
        }

        const txHash = submitResult.value;
        logger.info("Liqwid transaction submitted successfully", {
          txHash,
          userAddress: user_address,
        });

        return reply.status(200).send({
          success: true,
          data: {
            tx_hash: txHash,
          },
        });
      } catch (error) {
        logger.error("Exception submitting Liqwid transaction", {
          error,
          userAddress: user_address,
        });
        return reply.status(400).send({
          success: false,
          error: error instanceof Error ? error.message : "Failed to submit transaction",
        });
      }
    },
  );
}
