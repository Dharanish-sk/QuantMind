import { useState } from "react";   
import { Text,useInput } from "ink";


type InputProps = {
    onSubmit:(value:string)=>void;

};

export function Input({onSubmit}:InputProps){
    const [value,setValue] = useState("");

    useInput((input,key)=>{
        if(key.escape){
            process.exit(0);
        }
        if(key.return){
            onSubmit(value);
            setValue("");
            return;
        }
        if(key.delete || key.backspace){
            setValue((prev)=>prev.slice(0,-1));
            return;
        }
        setValue((prev)=>prev+input);
    });
    return <Text>Query: {value}</Text>;
    
}

