/**
 * Handle Discord button interactions
 */
import { handleItemClaim, handlePageNavigation, handleForceFinalize, handleGraceFinalize } from '../handlers/pollBillHandler.js';

export async function handleInteraction(interaction) {
  // Only handle button interactions
  if (!interaction.isButton()) return;

  const { customId } = interaction;

  try {
    // Route based on customId prefix
    if (customId.startsWith('toggle_') || customId.startsWith('claim_') || customId.startsWith('unclaim_')) {
      await handleItemClaim(interaction);
    } else if (customId.startsWith('page_')) {
      await handlePageNavigation(interaction);
    } else if (customId.startsWith('force_finalize_')) {
      await handleForceFinalize(interaction);
    } else if (customId.startsWith('grace_finalize_')) {
      await handleGraceFinalize(interaction);
    }
  } catch (error) {
    console.error('❌ Interaction handler error:', error);
    
    // Send error message (check if already replied)
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: '❌ Terjadi error. Coba lagi.', 
        ephemeral: true 
      });
    }
  }
}
