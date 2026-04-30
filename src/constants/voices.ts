export interface Voice {
  id: string;
  name: string;
}

export const ENGLISH_VOICES: Voice[] = [
  { id: 'English_Graceful_Lady', name: 'Graceful Lady' },
  { id: 'English_Trustworthy_Man', name: 'Trustworthy Man' },
  { id: 'English_Insightful_Speaker', name: 'Insightful Speaker' },
  { id: 'English_radiant_girl', name: 'Radiant Girl' },
  { id: 'English_Persuasive_Man', name: 'Persuasive Man' },
  { id: 'English_Aussie_Bloke', name: 'Aussie Bloke' },
  { id: 'English_Whispering_girl', name: 'Whispering Girl' },
  { id: 'English_Diligent_Man', name: 'Diligent Man' },
  { id: 'English_Gentle-voiced_man', name: 'Gentle-voiced Man' },
  { id: 'English_Lucky_Robot', name: 'Lucky Robot' },
  { id: 'Santa_Claus', name: 'Santa Claus' },
  { id: 'Grinch', name: 'Grinch' },
  { id: 'Rudolph', name: 'Rudolph' },
  { id: 'Arnold', name: 'Arnold' },
  { id: 'Charming_Santa', name: 'Charming Santa' },
  { id: 'Charming_Lady', name: 'Charming Lady' },
  { id: 'Sweet_Girl', name: 'Sweet Girl' },
  { id: 'Cute_Elf', name: 'Cute Elf' },
  { id: 'Attractive_Girl', name: 'Attractive Girl' },
  { id: 'Serene_Woman', name: 'Serene Woman' },
];

export const DEFAULT_VOICE_ID = 'English_Graceful_Lady';
