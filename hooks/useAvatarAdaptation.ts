/**
 * hooks/useAvatarAdaptation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook que expone la lógica de adaptación automática de avatar.
 * Monitorea el flujo de mensajes y gatilla cambios autónomos si
 * detecta preferencias fuertes.
 */

import { useEffect, useRef } from 'react';
import { AvatarLearningService } from '../services/AvatarLearningService';
import { AvatarSettings } from '../types';

interface UseAvatarAdaptationProps {
  userMessage: string;
  currentAvatar: AvatarSettings;
  updateAvatar: (settings: Partial<AvatarSettings>) => void;
  enabled?: boolean;
}

export function useAvatarAdaptation({
  userMessage,
  currentAvatar,
  updateAvatar,
  enabled = true
}: UseAvatarAdaptationProps) {
  const lastProcessedMessageRef = useRef('');

  useEffect(() => {
    if (!enabled || !userMessage || userMessage === lastProcessedMessageRef.current) return;
    lastProcessedMessageRef.current = userMessage;

    // 1. Detectar preferencias explícitas ("me gusta cuando usas...")
    const explicit = AvatarLearningService.learnExplicitPreference(userMessage);
    if (explicit) {
      console.log(`🧠 [useAvatarAdaptation] Preferencia explícita detectada: ${explicit.avatar} para ${explicit.topicOrMood}`);
      const modelUrl = explicit.avatar === 'Nova Anime' ? '/models/nova-avatar.glb' : '/models/grokani_lipsync.glb';
      
      if (currentAvatar.name !== explicit.avatar) {
        updateAvatar({
          modelUrl,
          name: explicit.avatar
        });
      }
      return;
    }

    // 2. Aprendizaje implícito: Detectar contexto del mensaje del usuario
    const contexts = AvatarLearningService.detectContext(userMessage);
    if (contexts.length === 0) return;

    // Obtener recomendación de avatar basado en el historial
    const recommendation = AvatarLearningService.getBestAvatar(contexts);
    if (recommendation) {
      const { avatarName, confidence } = recommendation;
      
      // Si la confianza es alta (>0.6) y es diferente al actual, cambiar
      if (confidence > 0.6 && currentAvatar.name !== avatarName) {
        console.log(`🧠 [useAvatarAdaptation] Cambio automático sugerido: ${avatarName} (Confianza: ${(confidence * 100).toFixed(0)}%)`);
        const modelUrl = avatarName === 'Nova Anime' ? '/models/nova-avatar.glb' : '/models/grokani_lipsync.glb';
        
        updateAvatar({
          modelUrl,
          name: avatarName
        });
      }
    }
  }, [userMessage, currentAvatar.name, updateAvatar, enabled]);
}
