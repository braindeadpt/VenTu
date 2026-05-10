'use client';

import { 
  Car, GraduationCap, Utensils, Train, Droplets, Anchor, 
  Waves, Wind, Heart, Shield, Fish, Tent, Hotel, Store,
  ParkingCircle, Wifi, Phone, Cross, Binoculars, Lock
} from 'lucide-react';

const FACILITY_ICONS: Record<string, React.ReactNode> = {
  'Estacionamento': <Car className="w-4 h-4 text-surf-400" />,
  'Estacionamento pago': <Car className="w-4 h-4 text-surf-400" />,
  'Escolas surf': <GraduationCap className="w-4 h-4 text-surf-400" />,
  'Escola surf': <GraduationCap className="w-4 h-4 text-surf-400" />,
  'Restaurantes': <Utensils className="w-4 h-4 text-surf-400" />,
  'Restaurante': <Utensils className="w-4 h-4 text-surf-400" />,
  'Bar': <Utensils className="w-4 h-4 text-surf-400" />,
  'Metro': <Train className="w-4 h-4 text-surf-400" />,
  'Comboio': <Train className="w-4 h-4 text-surf-400" />,
  'WC': <Droplets className="w-4 h-4 text-surf-400" />,
  'WC Público': <Droplets className="w-4 h-4 text-surf-400" />,
  'WC público': <Droplets className="w-4 h-4 text-surf-400" />,
  'Chuveiros': <Droplets className="w-4 h-4 text-surf-400" />,
  'Aluguer equipamento': <Anchor className="w-4 h-4 text-surf-400" />,
  'Aluguer pranchas': <Anchor className="w-4 h-4 text-surf-400" />,
  'Nadador-salvador': <Shield className="w-4 h-4 text-surf-400" />,
  'Acesso fácil': <Heart className="w-4 h-4 text-surf-400" />,
  'Acesso PMR': <Heart className="w-4 h-4 text-surf-400" />,
  'Posto médico': <Cross className="w-4 h-4 text-surf-400" />,
  'Camping': <Tent className="w-4 h-4 text-surf-400" />,
  'Alojamento': <Hotel className="w-4 h-4 text-surf-400" />,
  'Loja': <Store className="w-4 h-4 text-surf-400" />,
  'Parque infantil': <Fish className="w-4 h-4 text-surf-400" />,
  'Miradouro': <Binoculars className="w-4 h-4 text-surf-400" />,
  'WiFi': <Wifi className="w-4 h-4 text-surf-400" />,
  'Telefone': <Phone className="w-4 h-4 text-surf-400" />,
};

interface FacilityIconProps {
  name: string;
}

export default function FacilityIcon({ name }: FacilityIconProps) {
  const icon = FACILITY_ICONS[name];
  if (!icon) {
    return <div className="w-1.5 h-1.5 rounded-full bg-surf-400" />;
  }
  return <div className="flex items-center justify-center w-6 h-6">{icon}</div>;
}

export function getFacilityIcon(name: string): React.ReactNode {
  return FACILITY_ICONS[name] || <div className="w-1.5 h-1.5 rounded-full bg-surf-400" />;
}

export function getHazardIcon(name: string): React.ReactNode {
  return <div className="w-1.5 h-1.5 rounded-full bg-wind-400" />;
}