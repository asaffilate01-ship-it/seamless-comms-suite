import {describe,expect,test} from "bun:test";
import {validatePracticeUpload} from "../../src/modules/practice-delivery/files.server";

describe("Practice portal file validation",()=>{
 test("accepts a minimal PDF signature",()=>{
  const bytes=Buffer.concat([Buffer.from("%PDF-1.4\n"),Buffer.from("fixture")]);
  expect(validatePracticeUpload(bytes.toString("base64"),"application/pdf").length).toBe(bytes.length);
 });
 test("rejects spoofed file signatures",()=>{
  expect(()=>validatePracticeUpload(Buffer.from("not-a-pdf").toString("base64"),"application/pdf")).toThrow("PDF signature mismatch");
 });
 test("rejects unsupported MIME types",()=>{
  expect(()=>validatePracticeUpload(Buffer.from("abc").toString("base64"),"application/zip")).toThrow("Unsupported practice file type");
 });
});
