'use client';

import { 
  Car, GraduationCap, Utensils, Train, Droplets, Anchor, 
  Waves, Wind, Heart, Shield, Fish, Tent, Hotel, Store,
  ParkingCircle, Wifi, Phone, Cross, Binoculars, Lock
} from 'lucide-react';

const FACILITY_ICONS: Record<string, React.ReactNode> = {
  'Estacionamento': <Car className="w-4 h-4 text-data-waves" />,
  'Estacionamento pago': <Car className="w-4 h-4 text-data-waves" />,
  'Escolas surf': <GraduationCap className="w-4 h-4 text-data-waves" />,
  'Escola surf': <GraduationCap className="w-4 h-4 text-data-waves" />,
  'Restaurantes': <Utensils className="w-4 h-4 text-data-waves" />,
  'Restaurante': <Utensils className="w-4 h-4 text-data-waves" />,
  'Bar': <Utensils className="w-4 h-4 text-data-waves" />,
  'Metro': <Train className="w-4 h-4 text-data-waves" />,
  'Comboio': <Train className="w-4 h-4 text-data-waves" />,
  'WC': <Droplets className="w-4 h-4 text-data-waves" />,
  'WC Público': <Droplets className="w-4 h-4 text-data-waves" />,
  'WC público': <Droplets className="w-4 h-4 text-data-waves" />,
  'Chuveiros': <Droplets className="w-4 h-4 text-data-waves" />,
  'Aluguer equipamento': <Anchor className="w-4 h-4 text-data-waves" />,
  'Aluguer pranchas': <Anchor className="w-4 h-4 text-data-waves" />,
  'Nadador-salvador': <Shield className="w-4 h-4 text-data-waves" />,
  'Acesso fácil': <Heart className="w-4 h-4 text-data-waves" />,
  'Acesso PMR': <Heart className="w-4 h-4 text-data-waves" />,
  'Posto médico': <Cross className="w-4 h-4 text-data-waves" />,
  'Camping': <Tent className="w-4 h-4 text-data-waves" />,
  'Alojamento': <Hotel className="w-4 h-4 text-data-waves" />,
  'Loja': <Store className="w-4 h-4 text-data-waves" />,
  'Parque infantil': <Fish className="w-4 h-4 text-data-waves" />,
  'Miradouro': <Binoculars className="w-4 h-4 text-data-waves" />,
  'WiFi': <Wifi className="w-4 h-4 text-data-waves" />,
  'Telefone': <Phone className="w-4 h-4 text-data-waves" />,
};

interface FacilityIconProps {
  name: string;
}

export default function FacilityIcon({ name }: FacilityIconProps) {
  const icon = FACILITY_ICONS[name];
  if (!icon) {
    return <div className="w-1.5 h-1.5 rounded-full bg-data-waves" />;
  }
  return <div className="flex items-center justify-center w-6 h-6">{icon}</div>;
}

export function getFacilityIcon(name: string): React.ReactNode {
  return FACILITY_ICONS[name] || <div className="w-1.5 h-1.5 rounded-full bg-surf-400" />;
}

export function getHazardIcon(name: string): React.ReactNode {
  return <div className="w-1.5 h-1.5 rounded-full bg-data-wind" />;
}