type Definition<T,R>={schema:{type:string;function:{name:string;[key:string]:unknown}};parse:(raw:string)=>T;execute:(value:T)=>Promise<R>;validateResult:(value:R)=>void};
/** Definitions own execution and validation; only the schema is visible to a model. */
export class ToolRegistry{
  private definitions=new Map<string,Definition<any,any>>();
  register<T,R>(definition:Definition<T,R>,enabled=true){
    if(!enabled)return;
    const name=definition.schema.function.name;
    if(this.definitions.has(name))throw Error('重複工具名稱：'+name);
    this.definitions.set(name,definition);
  }
  schemas(){return [...this.definitions.values()].map(definition=>structuredClone(definition.schema));}
  async execute(name:string,raw:string){
    const definition=this.definitions.get(name);if(!definition)throw Error('工具未啟用或不存在：'+name);
    const input=definition.parse(raw);
    const result=await definition.execute(structuredClone(input));definition.validateResult(result);return result;
  }
}
