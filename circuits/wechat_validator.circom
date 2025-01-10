pragma circom 2.2.0;
include "@zk-email/circuits/email-verifier.circom";
include "@zk-email/circuits/utils/regex.circom";
include "@zk-email/circuits/lib/base64.circom";
include "@zk-email/circuits/utils/array.circom"; // Slice
include "./wechat_export_mail_regex.circom";

template wechatExport(maxHeaderLength, maxBodyLength, n, k, packSize) {
  assert(n * k > 1024);

  signal input emailHeader[maxHeaderLength]; // prehashed email data, includes up to 512 + 64? bytes of padding pre SHA256, and padded with lots of 0s at end after the length
  signal input emailHeaderLength;
  signal input pubkey[k]; // rsa pubkey, verified with smart contract + DNSSEC proof. split up into k parts of n bits each.
  signal input signature[k]; // rsa signature. split up into k parts of n bits each.

  signal input bodyHashIndex;
  signal input precomputedSHA[32];
  signal input emailBody[maxBodyLength];
  signal input emailBodyLength;
  signal input ethereumAddress;

  signal output pubkeyHash;


    // DKIM Verification
    component EV = EmailVerifier(maxHeaderLength, maxBodyLength, n, k, 0, 0, 0, 0);
    EV.emailHeader <== emailHeader;
    EV.emailHeaderLength <== emailHeaderLength;
    EV.pubkey <== pubkey;
    EV.signature <== signature;
    // Should be provided if `ignoreBodyHashCheck` != 1
    EV.bodyHashIndex <== bodyHashIndex;
    EV.precomputedSHA <== precomputedSHA;
    EV.emailBody <== emailBody;
    EV.emailBodyLength <== emailBodyLength;
    // EV.decodedEmailBodyIn <==

    // Used for nullifier later
    pubkeyHash <== EV.pubkeyHash;

    // Find base64 part and extract it from email body
    // Original Base64 length: SGks(+68char)
    // TODO: counted in original email. May need dynamic detection later.
    // First line, first char of Base64 body begins at:
    var base64BeginAt = 175;
    // First line total chars:
    var base64Length = 72;
    // signal extractBase64Out, extractedBase64[base64Length];
    // (extractBase64Out, extractedBase64) <== WechatExtractBase64Regex(base64Length)(emailBody);
    // extractBase64Out === 1;
    component base64Extractor = Slice(maxBodyLength, base64BeginAt, base64BeginAt + base64Length);
    base64Extractor.in <== emailBody;

    // Decode email from Base64
    // Calculate decoded body size
    var base64DecodedSize = base64Length / 4 * 3;
    component emailDecoded = Base64Decode(base64DecodedSize);
    // emailDecoded.in <== extractedBase64;
    emailDecoded.in <== base64Extractor.out;
    // Output: emailDecoded.out

    // HANDLE Extraction
    signal input handleRegexIdx;
    var handleMaxLength = 20;
    signal handleRegexOut, handleRegexReveal[base64DecodedSize];
    (handleRegexOut, handleRegexReveal) <== WechatExportMailRegex(base64DecodedSize)(emailDecoded.out);
    handleRegexOut === 1;

    var inputLength = computeIntChunkLength(handleMaxLength);
    signal handlePackedOut[inputLength];
    handlePackedOut <== PackRegexReveal(base64DecodedSize, handleMaxLength)(handleRegexReveal, handleRegexIdx);

    signal output usernameHash;
    component poseidonComponent = Poseidon(inputLength);
    poseidonComponent.inputs <== handlePackedOut;
    usernameHash <== poseidonComponent.out;
}

component main { public [ethereumAddress] } = wechatExport(704, 4288, 121, 17, 7);
