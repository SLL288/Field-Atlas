export type Capability='ocr'|'batchImport'|'projects'|'overlap'|'advancedFilters'|'export';
export const entitlements={
 developmentUnlocked:true,
 can(_capability:Capability){return this.developmentUnlocked;},
 require(capability:Capability){if(!this.can(capability))throw Error('This feature requires Pro.');}
};
