import { Transaction, TransactionInput } from './types';
import { UTXOPoolManager } from './utxo-pool';
import { verify } from './utils/crypto';
import {
  ValidationResult,
  ValidationError,
  VALIDATION_ERRORS,
  createValidationError
} from './errors';

export class TransactionValidator {
  constructor(private utxoPool: UTXOPoolManager) {}

  /**
   * Validate a transaction
   * @param {Transaction} transaction - The transaction to validate
   * @returns {ValidationResult} The validation result
   */
  validateTransaction(transaction: Transaction): ValidationResult {
    const errors: ValidationError[] = [];
    const utxosVistos = new Set<string>();
    let inputTotal = 0;
    let outputTotal = 0;

    for (const input of transaction.inputs){
      //verifico si el utxo existe
      const utxo = this.utxoPool.getUTXO(input.utxoId.txId, input.utxoId.outputIndex);
      if (!utxo){
        errors.push(createValidationError(VALIDATION_ERRORS.UTXO_NOT_FOUND, `UTXO no encontrado: ${input.utxoId.txId}:${input.utxoId.outputIndex}`));
        continue; //salteo este caso, ya se que el utxo no cumple
      }

      //verifico si el utxo es duplicado
      const utxoKey = `${utxo.id.txId}:${utxo.id.outputIndex}`;
      if (utxosVistos.has(utxoKey)){
        errors.push(createValidationError(VALIDATION_ERRORS.DOUBLE_SPENDING, `UTXO ya gastado: ${utxoKey}`));
      }
      utxosVistos.add(utxoKey);

      //verifico si la firma es valida
      const transactionDataForSigning = this.createTransactionDataForSigning_(transaction);
      if (!verify(transactionDataForSigning, input.signature, input.owner)){
        errors.push(createValidationError(VALIDATION_ERRORS.INVALID_SIGNATURE, `Firma inválida para UTXO: ${utxoKey}`));
      }

      inputTotal += utxo.amount; //pasó las verificaciones, es valido y lo agrego
    }

    //verifico y sumo las salidas
    for (const salida of transaction.outputs) {
      if (salida.amount <= 0) {
        errors.push(createValidationError(VALIDATION_ERRORS.NEGATIVE_AMOUNT, `Cantidad de salida inválida: ${salida.amount}`));
      }
      outputTotal += salida.amount;
    }

    //verifico si hay una diferencia en las cantidades
    if (inputTotal !== outputTotal) {
      errors.push(createValidationError(VALIDATION_ERRORS.AMOUNT_MISMATCH, `La suma de las entradas (${inputTotal}) no coincide con la suma de las salidas (${outputTotal})`));
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a deterministic string representation of the transaction for signing
   * This excludes the signatures to prevent circular dependencies
   * @param {Transaction} transaction - The transaction to create a data for signing
   * @returns {string} The string representation of the transaction for signing
   */
  private createTransactionDataForSigning_(transaction: Transaction): string {
    const unsignedTx = {
      id: transaction.id,
      inputs: transaction.inputs.map(input => ({
        utxoId: input.utxoId,
        owner: input.owner
      })),
      outputs: transaction.outputs,
      timestamp: transaction.timestamp
    };

    return JSON.stringify(unsignedTx);
  }
}
